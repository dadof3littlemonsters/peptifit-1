import { useEffect, useRef, useState } from 'react';

export default function BarcodeScanner({ active, onDetected, onError }) {
  const elementIdRef = useRef(`food-barcode-scanner-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef(null);
  const handledRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const onErrorRef = useRef(onError);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onErrorRef.current = onError;
  }, [onDetected, onError]);

  useEffect(() => {
    handledRef.current = false;
  }, [active]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let cancelled = false;

    const startScanner = async () => {
      setIsStarting(true);

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        if (cancelled) {
          return;
        }

        const scanner = new Html5Qrcode(elementIdRef.current, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E
          ],
          verbose: false
        });

        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 140 } },
          (decodedText) => {
            if (handledRef.current) {
              return;
            }

            handledRef.current = true;
            onDetectedRef.current(decodedText);
          },
          () => {}
        );
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current(error);
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false);
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;

      const scanner = scannerRef.current;
      scannerRef.current = null;

      if (scanner) {
        scanner.stop().catch(() => {}).finally(() => {
          scanner.clear().catch(() => {});
        });
      }
    };
  }, [active]);

  return (
    <div className="space-y-3">
      <div id={elementIdRef.current} className="overflow-hidden rounded-xl border border-gray-700 bg-black" />
      {isStarting && (
        <p className="text-center text-sm text-gray-400">Starting camera...</p>
      )}
    </div>
  );
}
