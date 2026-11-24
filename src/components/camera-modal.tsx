"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, VideoOff, X } from "lucide-react";

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export function CameraModal({ open, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function startCamera() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setError("Camera capture is not available in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setError(
            "Camera access was blocked or no webcam is connected. Allow camera permissions or upload a photo file instead."
          );
        }
      }
    }

    startCamera();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onClose]);

  if (!open) return null;

  function captureFrame() {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement("canvas");
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Un-mirror horizontal flip matching the preview
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "camera-portrait.jpg", {
          type: "image/jpeg",
        });
        onClose();
        onCapture(file);
      },
      "image/jpeg",
      0.9
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Take a portrait photo to scan"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
          <h2 className="font-display text-[15.5px] font-semibold text-[#111827]">
            Take photo
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {error ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-6 py-12 text-center">
              <VideoOff className="mb-3 h-7 w-7 text-zinc-400" />
              <p className="text-[13px] leading-relaxed text-zinc-600">{error}</p>
            </div>
          ) : (
            <div className="relative aspect-[4/4.2] overflow-hidden rounded-xl bg-zinc-900">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full -scale-x-100 object-cover"
              />
              {/* Subtle portrait frame overlay */}
              <div className="pointer-events-none absolute inset-6">
                <span className="absolute top-0 left-0 h-5 w-5 border-t-2 border-l-2 border-white/75" />
                <span className="absolute top-0 right-0 h-5 w-5 border-t-2 border-r-2 border-white/75" />
                <span className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-white/75" />
                <span className="absolute right-0 bottom-0 h-5 w-5 border-b-2 border-r-2 border-white/75" />
              </div>
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center text-[13px] text-zinc-300">
                  Starting camera...
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-3.5 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Cancel
            </button>
            {!error && (
              <button
                type="button"
                disabled={!ready}
                onClick={captureFrame}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                Capture & scan
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
