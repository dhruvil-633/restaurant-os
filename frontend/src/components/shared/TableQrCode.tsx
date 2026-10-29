import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface TableQrCodeProps {
  tableId: string;
  label: string;
}

/**
 * The QR code a guest scans at the table to order from their own phone.
 *
 * Rendered in the browser rather than on the server: the code is just the
 * table's own ordering URL, so there is nothing worth a round trip.
 */
export function TableQrCode({ tableId, label }: TableQrCodeProps) {
  const [dataUrl, setDataUrl] = useState('');
  const url = `${window.location.origin}/order?table=${tableId}`;

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: 'M' })
      .then((result) => {
        if (active) setDataUrl(result);
      })
      .catch(() => {
        // A failed render leaves the link visible, which is still usable.
        if (active) setDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [url]);

  const download = (): void => {
    if (!dataUrl) return;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `table-${label.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    anchor.click();
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Order by QR</p>

      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-sunken p-3">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`QR code to order at table ${label}`}
            className="size-24 shrink-0 rounded-lg bg-white p-1"
          />
        ) : (
          <div className="flex size-24 shrink-0 items-center justify-center rounded-lg bg-surface">
            <QrCode className="size-8 text-ink-subtle" />
          </div>
        )}

        <div className="min-w-0 space-y-2">
          <p className="text-[11px] text-ink-muted">
            Print this and put it on {label}. Scanning it starts a dine-in order already assigned
            to the table.
          </p>
          <Button variant="secondary" size="sm" disabled={!dataUrl} onClick={download}>
            <Download />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}
