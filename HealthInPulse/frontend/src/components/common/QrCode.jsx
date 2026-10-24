// ─── QR code em SVG inline ──────────────────────────────────
// A matriz vem do pacote `qrcode` (QRCode.create, síncrono, funciona
// offline) e o desenho é um <path> React: sem innerHTML.
import { useMemo } from 'react';
import QRCode from 'qrcode';
import clsx from 'clsx';

const QUIET = 1; // margem em módulos

export default function QrCode({ value, size = 160, className, label }) {
  const qr = useMemo(() => {
    try {
      const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
      let d = '';
      for (let r = 0; r < modules.size; r++) {
        for (let c = 0; c < modules.size; c++) {
          if (modules.get(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
        }
      }
      return { d, n: modules.size + QUIET * 2 };
    } catch {
      return null;
    }
  }, [value]);

  if (!qr) return null;

  return (
    <div
      className={clsx('bg-white rounded-xl p-1.5 border border-surface-200 shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${qr.n} ${qr.n}`}
        width="100%" height="100%"
        shapeRendering="crispEdges"
        role="img"
        aria-label={label || `QR code para ${value}`}
      >
        <rect width={qr.n} height={qr.n} fill="#ffffff" />
        <path d={qr.d} fill="#002a55" />
      </svg>
    </div>
  );
}
