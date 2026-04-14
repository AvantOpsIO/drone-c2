package telemetry

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	ringSize = 120
)

type ringBuffer struct {
	buf  []TelemetryMessage
	head int
	len  int
}

func newRingBuffer(capacity int) *ringBuffer {
	return &ringBuffer{buf: make([]TelemetryMessage, capacity)}
}

func (r *ringBuffer) push(msg TelemetryMessage) {
	r.buf[r.head] = msg
	r.head = (r.head + 1) % len(r.buf)
	if r.len < len(r.buf) {
		r.len++
	}
}

func (r *ringBuffer) snapshot() []TelemetryMessage {
	out := make([]TelemetryMessage, r.len)
	start := (r.head - r.len + len(r.buf)) % len(r.buf)
	for i := 0; i < r.len; i++ {
		out[i] = r.buf[(start+i)%len(r.buf)]
	}
	return out
}

type client struct {
	conn   *websocket.Conn
	send   chan []byte
	remote string
}

type Hub struct {
	mu       sync.RWMutex
	clients  map[*client]struct{}
	rings    map[string]*ringBuffer
	incoming chan TelemetryMessage

	posMu     sync.RWMutex
	positions map[string]TelemetryMessage
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[*client]struct{}),
		rings:     make(map[string]*ringBuffer),
		incoming:  make(chan TelemetryMessage, 256),
		positions: make(map[string]TelemetryMessage),
	}
}

func (h *Hub) Incoming() chan<- TelemetryMessage {
	return h.incoming
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) LatestPositions() map[string]TelemetryMessage {
	h.posMu.RLock()
	defer h.posMu.RUnlock()
	out := make(map[string]TelemetryMessage, len(h.positions))
	for k, v := range h.positions {
		out[k] = v
	}
	return out
}

func (h *Hub) Run(ctx context.Context) {
	slog.Info("hub_start")
	defer slog.Info("hub_stop")

	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-h.incoming:
			msg.ReceivedAt = time.Now()

			h.posMu.RLock()
			world := make(map[string]TelemetryMessage, len(h.positions)+1)
			for k, v := range h.positions {
				world[k] = v
			}
			h.posMu.RUnlock()
			world[msg.DroneID] = msg
			msg.SyntheticEOContacts = BuildSyntheticEOContacts(msg, world, DefaultSyntheticEOParams())

			data, err := json.Marshal(msg)
			if err != nil {
				slog.Error("hub_marshal_error", "error", err, "drone", msg.DroneID)
				continue
			}

			h.mu.Lock()
			ring, ok := h.rings[msg.DroneID]
			if !ok {
				ring = newRingBuffer(ringSize)
				h.rings[msg.DroneID] = ring
			}
			ring.push(msg)
			h.mu.Unlock()

			h.posMu.Lock()
			h.positions[msg.DroneID] = msg
			h.posMu.Unlock()

			h.mu.RLock()
			for c := range h.clients {
				select {
				case c.send <- data:
				default:
					slog.Warn("ws_drop", "remote", c.remote, "drone", msg.DroneID)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	remote := r.RemoteAddr

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		slog.Error("ws_accept_error", "error", err, "remote", remote)
		return
	}
	defer conn.CloseNow()

	c := &client{
		conn:   conn,
		send:   make(chan []byte, 256),
		remote: remote,
	}

	ctx := r.Context()
	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			_, _, err := conn.Read(ctx)
			if err != nil {
				return
			}
		}
	}()

	go func() {
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case data := <-c.send:
				if err := conn.Write(ctx, websocket.MessageText, data); err != nil {
					slog.Warn("ws_write_error", "error", err, "remote", remote)
					return
				}
			}
		}
	}()

	h.mu.Lock()
	h.clients[c] = struct{}{}
	clientCount := len(h.clients)
	h.mu.Unlock()

	slog.Info("ws_connect", "remote", remote, "clients_total", clientCount)

	defer func() {
		h.mu.Lock()
		delete(h.clients, c)
		remaining := len(h.clients)
		h.mu.Unlock()
		slog.Info("ws_disconnect", "remote", remote, "clients_total", remaining)
	}()

	hydrated := 0
	h.mu.RLock()
	for _, ring := range h.rings {
		for _, msg := range ring.snapshot() {
			data, err := json.Marshal(msg)
			if err != nil {
				continue
			}
			select {
			case c.send <- data:
				hydrated++
			default:
			}
		}
	}
	h.mu.RUnlock()
	slog.Debug("ws_hydrate", "remote", remote, "messages", hydrated)

	select {
	case <-done:
	case <-ctx.Done():
	}
}
