package main

/*
#cgo pkg-config: gstreamer-1.0 gstreamer-app-1.0

#include "gst.h"

*/
import "C"
import (
	"fmt"
	"sync"
	"unsafe"

	"github.com/pion/webrtc/v2"
	"github.com/pion/webrtc/v2/pkg/media"
)

func init() {
	go C.gstreamer_send_start_mainloop()
}

// Pipeline is a wrapper for a GStreamer Pipeline
type Pipeline struct {
	Pipeline  *C.GstElement
	tracks    []*webrtc.Track
	id        int
	codecName string
}

var pipelines = make(map[int]*Pipeline)
var pipelinesLock sync.Mutex

// CreateMyPipeline creates a GStreamer Pipeline
func CreateMyPipeline(codecName string, tracks []*webrtc.Track, pipelineSrc string) *Pipeline {
	fmt.Println("creating a pipeline")
	pipelineStr := "appsink name=appsink"
	switch codecName {
	case webrtc.VP8:
		pipelineStr = pipelineSrc + " ! vp8enc error-resilient=partitions keyframe-max-dist=10 auto-alt-ref=true cpu-used=5 deadline=1 ! " + pipelineStr
	case webrtc.VP9:
		pipelineStr = pipelineSrc + " ! vp9enc ! " + pipelineStr
	case webrtc.H264:
		pipelineStr = pipelineSrc + " ! video/x-raw,format=I420 ! x264enc bframes=0 speed-preset=veryfast key-int-max=60 ! video/x-h264,stream-format=byte-stream ! " + pipelineStr
	case webrtc.Opus:
		pipelineStr = pipelineSrc + " ! opusenc ! " + pipelineStr
	case webrtc.G722:
		pipelineStr = pipelineSrc + " ! avenc_g722 ! " + pipelineStr
	default:
		panic("Unhandled codec " + codecName)
	}

	pipelineStrUnsafe := C.CString(pipelineStr)
	defer C.free(unsafe.Pointer(pipelineStrUnsafe))

	pipelinesLock.Lock()
	defer pipelinesLock.Unlock()

	pipeline := &Pipeline{
		Pipeline:  C.gstreamer_send_create_pipeline(pipelineStrUnsafe),
		tracks:    tracks,
		id:        len(pipelines),
		codecName: codecName,
	}

	pipelines[pipeline.id] = pipeline
	return pipeline
}

// Start starts the GStreamer Pipeline
func (p *Pipeline) Start() {
	C.gstreamer_send_start_pipeline(p.Pipeline, C.int(p.id))
}

// Stop stops the GStreamer Pipeline
func (p *Pipeline) Stop() {
	C.gstreamer_send_stop_pipeline(p.Pipeline)
}

const (
	videoClockRate = 90000
	audioClockRate = 48000
)

//export goHandlePipelineBuffer
func goHandlePipelineBuffer(buffer unsafe.Pointer, bufferLen C.int, duration C.int, pipelineID C.int) {
	pipelinesLock.Lock()
	pipeline, ok := pipelines[int(pipelineID)]
	pipelinesLock.Unlock()

	if ok {
		var samples uint32
		if pipeline.codecName == webrtc.Opus {
			samples = uint32(audioClockRate * (float32(duration) / 1000000000))
		} else {
			samples = uint32(videoClockRate * (float32(duration) / 1000000000))
		}
		for _, t := range pipeline.tracks {
			if err := t.WriteSample(media.Sample{Data: C.GoBytes(buffer, bufferLen), Samples: samples}); err != nil {
				panic(err)
			}
		}
	} else {
		fmt.Printf("discarding buffer, no pipeline with id %d", int(pipelineID))
	}
	C.free(buffer)
}
