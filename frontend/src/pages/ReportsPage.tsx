import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { AXIS_PROPS, CHART_COLORS, ChartTooltip, currencyTick } from '@/components/charts/chartTheme';
import { downloadBlob, formatCurrency, formatDate, toDateInputValue } from '@/lib/utils';
import { getErrorMessage } from '@/services/api';
import { reportService } from '@/services';

const EXPORTS = [
  { key: 'revenue', label: 'Revenue by day', description: 'Daily takings, tax and discounts' },
  { key: 'orders', label: 'Orders', description: 'Every ticket with totals and timings' },
  { key: 'customers', label: 'Guests', description: 'Visit counts, spend and loyalty points' },
  { key: 'inventory', label: 'Inventory', description: 'Stock levels and valuation' },
  { key: 'employees', label: 'Employees', description: 'Roster, roles and salaries' },
  { key: 'menu-sales', label: 'Menu sales', description: 'Quantity sold and revenue per dish' },
];

export default function ReportsPage() {
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return toDateInputValue(date);
  });
  const [to, setTo] = useState(() => toDateInputValue(new Date()));
  const [downloading, setDownloading] = useState<string | null>(null);

  const params = { from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() };

  const revenue = useQuery({
    queryKey: ['reports', 'revenue', params],
    queryFn: () => reportService.revenue(params),
  });

  const exportCsv = async (kind: string, label: string): Promise<void> => {
    setDownloading(kind);
    try {
      const blob = await reportService.exportCsv(kind, params);
      downloadBlob(blob, `${kind}-${toDateInputValue(new Date())}.csv`);
      toast.success(`${label} exported`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not export the report'));
    } finally {
      setDownloading(null);
    }
  };

  /** Builds the revenue PDF client-side, so no server rendering is required. */
  const exportPdf = (): void => {
    const data = revenue.data;
    if (!data) return;

    const document_ = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    document_.setFontSize(18);
    document_.text('Revenue report', 40, 44);
    document_.setFontSize(10);
    document_.setTextColor(110);
    document_.text(`${formatDate(data.from)} — ${formatDate(data.to)}`, 40, 62);

    document_.setTextColor(30);
    document_.setFontSize(11);
    document_.text(
      `Revenue ${formatCurrency(data.totals.revenue)}   ·   Orders ${data.totals.completed}   ·   ` +
        `Guests ${data.totals.guests}   ·   Average order ${formatCurrency(data.totals.averageOrderValue)}`,
      40,
      86,
    );

    autoTable(document_, {
      startY: 104,
      head: [['Date', 'Orders', 'Completed', 'Cancelled', 'Guests', 'Revenue', 'Tax', 'Avg. order']],
      body: data.rows.map((row) => [
        row.date,
        row.orders,
        row.completed,
        row.cancelled,
        row.guests,
        formatCurrency(row.revenue),
        formatCurrency(row.tax),
        formatCurrency(row.averageOrderValue),
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
    });

    document_.save(`revenue-report-${toDateInputValue(new Date())}.pdf`);
    toast.success('PDF exported');
  };

  const totals = revenue.data?.totals;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Pull the numbers for a period, then take them away as CSV or PDF."
        actions={
          <>
            <Button variant="secondary" onClick={exportPdf} disabled={!revenue.data}>
              <FileText />
              Revenue PDF
            </Button>
            <Button onClick={() => void exportCsv('revenue', 'Revenue')} loading={downloading === 'revenue'}>
              <Download />
              Revenue CSV
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <Field label="From" className="sm:w-48">
            <Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To" className="sm:w-48">
            <Input
              type="date"
              value={to}
              min={from}
              max={toDateInputValue(new Date())}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {revenue.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : !totals || revenue.data?.rows.length === 0 ? (
        <EmptyState
          title="No orders in this period"
          description="Choose a wider date range to see figures."
        />
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Revenue" value={formatCurrency(totals.revenue)} />
            <Summary label="Completed orders" value={String(totals.completed)} />
            <Summary label="Average order" value={formatCurrency(totals.averageOrderValue)} />
            <Summary label="Per guest" value={formatCurrency(totals.averagePerGuest)} />
          </div>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Daily revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenue.data?.rows ?? []} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      {...AXIS_PROPS}
                      minTickGap={24}
                      tickFormatter={(value: string) =>
                        new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      }
                    />
                    <YAxis {...AXIS_PROPS} tickFormatter={currencyTick} width={56} />
                    <Tooltip
                      cursor={{ fill: 'var(--surface-hover)' }}
                      content={<ChartTooltip currencyKeys={['revenue', 'tax']} />}
                    />
                    <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.brand} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Day by day</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TableWrapper>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Cancelled</TableHead>
                      <TableHead className="text-right">Guests</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Avg. order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(revenue.data?.rows ?? []).map((row) => (
                      <TableRow key={row.date}>
                        <TableCell className="font-medium text-ink">{formatDate(row.date)}</TableCell>
                        <TableCell className="text-right tabular">{row.orders}</TableCell>
                        <TableCell className="text-right tabular text-success">{row.completed}</TableCell>
                        <TableCell className="text-right tabular text-danger">{row.cancelled}</TableCell>
                        <TableCell className="text-right tabular">{row.guests}</TableCell>
                        <TableCell className="text-right font-semibold tabular">
                          {formatCurrency(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right tabular text-ink-muted">
                          {formatCurrency(row.averageOrderValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Export data</CardTitle>
          <p className="mt-0.5 text-sm text-ink-muted">
            CSV files open directly in Excel or Google Sheets and respect the date range above.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORTS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => void exportCsv(item.key, item.label)}
              disabled={downloading === item.key}
              className="flex items-start gap-3 rounded-xl border border-line p-3.5 text-left transition-colors hover:border-brand hover:bg-brand-soft disabled:opacity-60"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
                <FileSpreadsheet className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{item.label}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{item.description}</span>
              </span>
            </button>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular text-ink">{value}</p>
    </Card>
  );
}
