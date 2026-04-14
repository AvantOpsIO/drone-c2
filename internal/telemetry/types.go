package telemetry

import "time"

// TelemetryMessage is the normalized telemetry payload for a single drone at a
// single point in time. Every field uses SI units (meters, m/s, degrees) to
// avoid the conversion bugs that plague mixed-unit codebases.
//
// DEMO: JSON encoding for WebSocket transport. Production would use
// Protobuf or MessagePack here — JSON adds ~3x overhead per message, which
// matters at scale (hundreds of drones, multiple GCS consumers).
type TelemetryMessage struct {
	DroneID    string    `json:"droneId"`
	Timestamp  time.Time `json:"timestamp"`
	ReceivedAt time.Time `json:"receivedAt"`
	// SequenceNum detects drops and reordering at the client.
	SequenceNum uint32 `json:"sequenceNum"`

	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	AltitudeMSL float64 `json:"altitudeMSL"`
	AltitudeAGL float64 `json:"altitudeAGL"`
	GroundSpeed float64 `json:"groundSpeed"`
	// VerticalSpeed: positive = climb, negative = descend.
	VerticalSpeed float64 `json:"verticalSpeed"`
	Heading       float64 `json:"heading"`

	FlightMode string `json:"flightMode"`
	Armed      bool   `json:"armed"`

	BatteryVoltage       float64 `json:"batteryVoltage"`
	BatteryPercent       float64 `json:"batteryPercent"`
	BatteryTimeRemaining int     `json:"batteryTimeRemaining"`

	RSSI        int `json:"rssi"`
	LinkQuality int `json:"linkQuality"`

	GPSFixType     string `json:"gpsFixType"`
	SatelliteCount int    `json:"satelliteCount"`

	CommandLatency int `json:"commandLatency"`

	IFFMode          string `json:"iffMode"`
	EncryptionStatus string `json:"encryptionStatus"`

	BoundingBoxes []BoundingBox `json:"boundingBoxes"`
}

// BoundingBox represents an AI/ML inference detection overlaid on the sensor
// feed. Coordinates are normalized 0-1 relative to frame dimensions.
type BoundingBox struct {
	TrackID    string  `json:"trackId"`
	Label      string  `json:"label"`
	Confidence float64 `json:"confidence"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	W          float64 `json:"w"`
	H          float64 `json:"h"`
}
