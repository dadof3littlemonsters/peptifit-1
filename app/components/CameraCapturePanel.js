import { useEffect, useRef, useState } from 'react'

function stopStream(streamRef) {
  const stream = streamRef.current

  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }
}

export default function CameraCapturePanel({
  active,
  capturedImage,
  error,
  loading,
  loadingText,
  captureLabel,
  onCapture,
  onRetry,
  onFallback,
  fallbackLabel
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraError, setCameraError] = useState('')
  const [starting, setStarting] = useState(false)
  const [draftImage, setDraftImage] = useState('')
  const [draftSize, setDraftSize] = useState(null)
  const [cropZoom, setCropZoom] = useState(1.4)
  const [cropX, setCropX] = useState(50)
  const [cropY, setCropY] = useState(52)
  const [croppedPreview, setCroppedPreview] = useState('')

  useEffect(() => {
    if (!active) {
      setDraftImage('')
      setDraftSize(null)
      setCroppedPreview('')
      setCropZoom(1.4)
      setCropX(50)
      setCropY(52)
    }
  }, [active])

  useEffect(() => {
    if (!active || draftImage || capturedImage || loading) {
      stopStream(streamRef)
      return undefined
    }

    let cancelled = false

    const startCamera = async () => {
      setStarting(true)
      setCameraError('')

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280, max: 1280 }
          },
          audio: false
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (captureError) {
        if (!cancelled) {
          setCameraError('Unable to access camera. Check browser permissions and HTTPS.')
        }
      } finally {
        if (!cancelled) {
          setStarting(false)
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      stopStream(streamRef)
    }
  }, [active, draftImage, capturedImage, loading])

  useEffect(() => {
    if (!draftImage || !draftSize) {
      setCroppedPreview('')
      return
    }

    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const image = new Image()
    image.onload = () => {
      const aspectRatio = 0.8
      let cropWidth = draftSize.width / cropZoom
      let cropHeight = cropWidth / aspectRatio

      if (cropHeight > draftSize.height) {
        cropHeight = draftSize.height / cropZoom
        cropWidth = cropHeight * aspectRatio
      }

      const maxX = Math.max(0, draftSize.width - cropWidth)
      const maxY = Math.max(0, draftSize.height - cropHeight)
      const startX = (cropX / 100) * maxX
      const startY = (cropY / 100) * maxY
      const outputWidth = Math.min(720, Math.round(cropWidth))
      const outputHeight = Math.max(10, Math.round(outputWidth / aspectRatio))

      canvas.width = outputWidth
      canvas.height = outputHeight

      const context = canvas.getContext('2d')

      if (!context) {
        return
      }

      context.drawImage(
        image,
        startX,
        startY,
        cropWidth,
        cropHeight,
        0,
        0,
        outputWidth,
        outputHeight
      )

      setCroppedPreview(canvas.toDataURL('image/jpeg', 0.7))
    }
    image.src = draftImage
  }, [draftImage, draftSize, cropZoom, cropX, cropY])

  const handleCapture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError('Camera is not ready yet. Please try again.')
      return
    }

    const maxWidth = 960
    const scale = Math.min(1, maxWidth / video.videoWidth)
    const width = Math.max(10, Math.round(video.videoWidth * scale))
    const height = Math.max(10, Math.round(video.videoHeight * scale))

    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      setCameraError('Unable to capture image from camera.')
      return
    }

    context.drawImage(video, 0, 0, width, height)

    stopStream(streamRef)
    setDraftImage(canvas.toDataURL('image/jpeg', 0.8))
    setDraftSize({ width, height })
  }

  const handleAnalyzeCrop = () => {
    if (!croppedPreview) {
      setCameraError('Crop preview is not ready yet. Please try again.')
      return
    }

    onCapture({
      base64Image: croppedPreview.split(',')[1],
      previewUrl: croppedPreview
    })
  }

  const handleRetake = () => {
    setDraftImage('')
    setDraftSize(null)
    setCroppedPreview('')
    setCropZoom(1.4)
    setCropX(50)
    setCropY(52)
    onRetry()
  }

  const visibleError = error || cameraError

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-gray-700 bg-black">
        {capturedImage && loading ? (
          <>
            <img src={capturedImage} alt="Captured label" className="h-72 w-full object-cover" />
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/65">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                <p className="text-sm text-gray-200">{loadingText}</p>
              </div>
            )}
          </>
        ) : draftImage ? (
          <div className="space-y-3 p-3">
            <img
              src={croppedPreview || draftImage}
              alt="Crop preview"
              className="h-72 w-full rounded-lg object-cover"
            />
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                  <span>Zoom</span>
                  <span>{cropZoom.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={cropZoom}
                  onChange={(event) => setCropZoom(Number(event.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                  <span>Horizontal Crop</span>
                  <span>{cropX}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={cropX}
                  onChange={(event) => setCropX(Number(event.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                  <span>Vertical Crop</span>
                  <span>{cropY}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={cropY}
                  onChange={(event) => setCropY(Number(event.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative aspect-[3/4] w-full bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-4 rounded-2xl border border-cyan-500/40" />
          </div>
        )}
      </div>

      {starting && <p className="text-center text-sm text-gray-400">Starting camera...</p>}
      {visibleError && <p className="text-sm text-red-400">{visibleError}</p>}

      <div className="flex flex-col gap-2">
        {!draftImage && !capturedImage && (
          <button
            type="button"
            onClick={handleCapture}
            disabled={starting}
            className="min-h-[56px] rounded-xl bg-cyan-500 px-4 py-3 text-base font-semibold text-black transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {captureLabel}
          </button>
        )}

        {draftImage && !loading && (
          <button
            type="button"
            onClick={handleAnalyzeCrop}
            className="min-h-[56px] rounded-xl bg-cyan-500 px-4 py-3 text-base font-semibold text-black transition-colors hover:bg-cyan-400"
          >
            Analyze Crop
          </button>
        )}

        {(draftImage || capturedImage) && !loading && (
          <button
            type="button"
            onClick={handleRetake}
            className="min-h-[48px] rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            Retake Photo
          </button>
        )}

        {onFallback && (
          <button
            type="button"
            onClick={onFallback}
            disabled={loading}
            className="min-h-[48px] rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fallbackLabel}
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
