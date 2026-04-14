package video

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/avant-ops/drone-c2/internal/telemetry"
)

const (
	frameWidth  = 640
	frameHeight = 480
	fps         = 10
	jpegQuality = 75
)

// PositionSource provides the latest drone positions without blocking the
// telemetry path. The Hub's LatestPositions method satisfies this.
type PositionSource interface {
	LatestPositions() map[string]telemetry.TelemetryMessage
}

// terrain blobs are pre-generated irregular features on the synthetic overhead
// view. Real wide-area sensors see roads, buildings, and tree lines.
type terrainBlob struct {
	cx, cy float64
	rx, ry float64
	shade  uint8
}

// StreamMJPEG writes an MJPEG multipart stream to the HTTP response. Each
// frame is a synthetic top-down "wide area sensor" view showing drone positions
// over terrain. Uses only Go stdlib image packages — no CGo, no external libs.
func StreamMJPEG(w http.ResponseWriter, r *http.Request, positions PositionSource) {
	w.Header().Set("Content-Type", "multipart/x-mixed-replace; boundary=frame")
	w.Header().Set("Cache-Control", "no-cache")

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	blobs := generateTerrain(rng)

	// Map projection bounds: we map ~0.05 degrees of lat/lon to the image.
	// Centered on the Yuma test area.
	const (
		centerLat = 32.505
		centerLon = -114.405
		spanLat   = 0.05
		spanLon   = 0.06
	)

	ticker := time.NewTicker(time.Second / fps)
	defer ticker.Stop()

	frameCount := 0
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
		}

		img := image.NewRGBA(image.Rect(0, 0, frameWidth, frameHeight))

		// Background: dark thermal noise. Slight per-pixel variation gives
		// authentic sensor texture.
		for y := 0; y < frameHeight; y++ {
			for x := 0; x < frameWidth; x++ {
				v := uint8(18 + rng.Intn(8))
				img.SetRGBA(x, y, color.RGBA{v, v + 3, v, 255})
			}
		}

		// Terrain features.
		for _, b := range blobs {
			drawBlob(img, b)
		}

		// Draw drone positions and predicted tracks.
		positions := positions.LatestPositions()
		for _, msg := range positions {
			px := int((msg.Lon - (centerLon - spanLon/2)) / spanLon * frameWidth)
			py := int((1 - (msg.Lat-(centerLat-spanLat/2))/spanLat) * frameHeight)

			// Predicted track: 30 second extrapolation, dashed.
			for s := 1; s <= 30; s++ {
				dist := msg.GroundSpeed * float64(s)
				fx := px + int(dist*math.Sin(msg.Heading*math.Pi/180)*frameWidth/5000)
				fy := py - int(dist*math.Cos(msg.Heading*math.Pi/180)*frameHeight/5000)
				if s%3 == 0 && fx >= 0 && fx < frameWidth && fy >= 0 && fy < frameHeight {
					img.SetRGBA(fx, fy, color.RGBA{74, 158, 255, 100})
				}
			}

			// Drone hot pixel: bright white-hot 3x3 cluster.
			for dy := -1; dy <= 1; dy++ {
				for dx := -1; dx <= 1; dx++ {
					nx, ny := px+dx, py+dy
					if nx >= 0 && nx < frameWidth && ny >= 0 && ny < frameHeight {
						img.SetRGBA(nx, ny, color.RGBA{255, 255, 255, 255})
					}
				}
			}
		}

		// Burn in metadata overlays.
		ts := time.Now().UTC().Format("15:04:05.000Z")
		burnString(img, 8, 12, "WIDE AREA / SYNTHETIC", color.RGBA{180, 180, 180, 255})
		burnString(img, 8, frameHeight-20, ts, color.RGBA{180, 180, 180, 255})
		burnString(img, frameWidth/2-100, 12, "UNCLASSIFIED // DEMO", color.RGBA{255, 176, 0, 255})

		frameCount++
		burnString(img, frameWidth-100, frameHeight-20,
			fmt.Sprintf("F:%06d", frameCount), color.RGBA{120, 120, 120, 255})

		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: jpegQuality}); err != nil {
			slog.Warn("mjpeg_encode_error", "error", err, "frame", frameCount)
			return
		}

		fmt.Fprintf(w, "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n", buf.Len())
		if _, err := w.Write(buf.Bytes()); err != nil {
			slog.Debug("mjpeg_write_done", "frame", frameCount, "reason", err.Error())
			return
		}
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
}

func generateTerrain(rng *rand.Rand) []terrainBlob {
	blobs := make([]terrainBlob, 8+rng.Intn(5))
	for i := range blobs {
		blobs[i] = terrainBlob{
			cx:    float64(rng.Intn(frameWidth)),
			cy:    float64(rng.Intn(frameHeight)),
			rx:    20 + float64(rng.Intn(60)),
			ry:    20 + float64(rng.Intn(60)),
			shade: uint8(25 + rng.Intn(15)),
		}
	}
	return blobs
}

func drawBlob(img *image.RGBA, b terrainBlob) {
	minX := int(math.Max(0, b.cx-b.rx))
	maxX := int(math.Min(float64(frameWidth-1), b.cx+b.rx))
	minY := int(math.Max(0, b.cy-b.ry))
	maxY := int(math.Min(float64(frameHeight-1), b.cy+b.ry))

	for y := minY; y <= maxY; y++ {
		for x := minX; x <= maxX; x++ {
			dx := (float64(x) - b.cx) / b.rx
			dy := (float64(y) - b.cy) / b.ry
			if dx*dx+dy*dy <= 1.0 {
				img.SetRGBA(x, y, color.RGBA{b.shade - 3, b.shade + 2, b.shade - 3, 255})
			}
		}
	}
}

// burnString draws text character by character using a minimal 5x7 bitmap font.
// We avoid importing image/font to keep the binary small and dependency-free.
// Each character is a hardcoded 5x7 bit pattern — ugly but effective for
// metadata burn-in on a sensor feed.
func burnString(img *image.RGBA, x, y int, s string, c color.RGBA) {
	for _, ch := range s {
		pattern := charPattern(byte(ch))
		for row := 0; row < 7; row++ {
			for col := 0; col < 5; col++ {
				if pattern[row]&(1<<(4-col)) != 0 {
					px, py := x+col, y+row
					if px >= 0 && px < frameWidth && py >= 0 && py < frameHeight {
						img.SetRGBA(px, py, c)
					}
				}
			}
		}
		x += 6
	}
}

// charPattern returns a 5x7 bitmap for common ASCII characters. Only the
// characters needed for our overlays are defined — this is a sensor feed,
// not a word processor.
func charPattern(ch byte) [7]byte {
	switch {
	case ch >= 'A' && ch <= 'Z':
		return upperPatterns[ch-'A']
	case ch >= '0' && ch <= '9':
		return digitPatterns[ch-'0']
	case ch >= 'a' && ch <= 'z':
		return upperPatterns[ch-'a']
	case ch == '/':
		return [7]byte{0x01, 0x02, 0x04, 0x04, 0x08, 0x10, 0x10}
	case ch == ':':
		return [7]byte{0x00, 0x04, 0x04, 0x00, 0x04, 0x04, 0x00}
	case ch == '.':
		return [7]byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x04}
	case ch == '-':
		return [7]byte{0x00, 0x00, 0x00, 0x0E, 0x00, 0x00, 0x00}
	case ch == ' ':
		return [7]byte{}
	default:
		return [7]byte{0x1F, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1F}
	}
}

// Minimal 5x7 bitmaps for A-Z.
var upperPatterns = [26][7]byte{
	{0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11}, // A
	{0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E}, // B
	{0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E}, // C
	{0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E}, // D
	{0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F}, // E
	{0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10}, // F
	{0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F}, // G
	{0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11}, // H
	{0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E}, // I
	{0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C}, // J
	{0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11}, // K
	{0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F}, // L
	{0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11}, // M
	{0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11}, // N
	{0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E}, // O
	{0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10}, // P
	{0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D}, // Q
	{0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11}, // R
	{0x0E, 0x11, 0x10, 0x0E, 0x01, 0x11, 0x0E}, // S
	{0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04}, // T
	{0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E}, // U
	{0x11, 0x11, 0x11, 0x11, 0x0A, 0x0A, 0x04}, // V
	{0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11}, // W
	{0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11}, // X
	{0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04}, // Y
	{0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F}, // Z
}

var digitPatterns = [10][7]byte{
	{0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E}, // 0
	{0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E}, // 1
	{0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F}, // 2
	{0x0E, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0E}, // 3
	{0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02}, // 4
	{0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E}, // 5
	{0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E}, // 6
	{0x1F, 0x01, 0x02, 0x04, 0x04, 0x04, 0x04}, // 7
	{0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E}, // 8
	{0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C}, // 9
}
