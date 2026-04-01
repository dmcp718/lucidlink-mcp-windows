package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
)

// generateIcon creates a 32x32 ICO-format icon of an Erlenmeyer flask.
// If filled is true (healthy), the flask is half-filled with purple liquid.
// If filled is false (unhealthy), the flask is an empty outline.
func generateIcon(filled bool) []byte {
	const size = 32

	// Purple color matching macOS: #61149A
	purple := color.RGBA{R: 97, G: 20, B: 154, A: 255}

	img := image.NewRGBA(image.Rect(0, 0, size, size))

	// Flask geometry (Erlenmeyer shape):
	//   Narrow neck from y=3 to y=12, centered at x=16, width ~6px
	//   Shoulders widen from y=12 to y=18
	//   Wide base from y=18 to y=27, width ~22px
	//   Flat bottom at y=27
	//   Small rim at top y=2..3

	// Compute left and right edges of the flask at each y.
	// Returns -1, -1 if outside the flask.
	flaskEdge := func(y int) (float64, float64) {
		fy := float64(y)
		cx := 16.0 // center x

		switch {
		case fy >= 2 && fy < 4:
			// Rim / mouth — slightly wider than neck
			return cx - 3.5, cx + 3.5
		case fy >= 4 && fy < 12:
			// Narrow neck
			return cx - 2.5, cx + 2.5
		case fy >= 12 && fy < 19:
			// Shoulder — linear interpolation from neck to base
			t := (fy - 12.0) / 7.0
			halfW := 2.5 + t*(11.0-2.5)
			return cx - halfW, cx + halfW
		case fy >= 19 && fy <= 27:
			// Wide base
			return cx - 11.0, cx + 11.0
		}
		return -1, -1
	}

	// Liquid fill level: when filled, liquid fills from y=19 to y=27 (bottom half of flask body).
	liquidTop := 19.0

	const stroke = 1.5

	for y := 0; y < size; y++ {
		left, right := flaskEdge(y)
		if left < 0 {
			continue
		}

		for x := 0; x < size; x++ {
			fx := float64(x) + 0.5

			inside := fx >= left && fx <= right

			if !inside {
				continue
			}

			// Check if pixel is on the outline (within stroke of the edge).
			onLeftEdge := math.Abs(fx-left) < stroke
			onRightEdge := math.Abs(fx-right) < stroke
			onTopEdge := float64(y) <= 3.5 // rim top
			onBottomEdge := float64(y) >= 26.0 // base bottom
			onOutline := onLeftEdge || onRightEdge || onTopEdge || onBottomEdge

			if onOutline {
				img.Set(x, y, purple)
			} else if filled && float64(y) >= liquidTop {
				// Fill liquid in the bottom portion
				img.Set(x, y, purple)
			}
		}
	}

	return pngToICO(img, size)
}

// pngToICO wraps a single PNG image into ICO format.
func pngToICO(img *image.RGBA, size int) []byte {
	var pngBuf bytes.Buffer
	png.Encode(&pngBuf, img)
	pngData := pngBuf.Bytes()

	var ico bytes.Buffer

	// ICO header: reserved(2) + type(2) + count(2)
	binary.Write(&ico, binary.LittleEndian, uint16(0))    // reserved
	binary.Write(&ico, binary.LittleEndian, uint16(1))    // ICO type
	binary.Write(&ico, binary.LittleEndian, uint16(1))    // 1 image

	// ICO directory entry (16 bytes)
	ico.WriteByte(byte(size)) // width (0 = 256)
	ico.WriteByte(byte(size)) // height
	ico.WriteByte(0)          // color palette
	ico.WriteByte(0)          // reserved
	binary.Write(&ico, binary.LittleEndian, uint16(1))                // color planes
	binary.Write(&ico, binary.LittleEndian, uint16(32))               // bits per pixel
	binary.Write(&ico, binary.LittleEndian, uint32(len(pngData)))     // image size
	binary.Write(&ico, binary.LittleEndian, uint32(6+16))             // offset (header=6 + entry=16)

	ico.Write(pngData)

	return ico.Bytes()
}
