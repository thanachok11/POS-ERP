import React, { useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { th } from "date-fns/locale";
import { jwtDecode } from "jwt-decode";

import "../../styles/page/DashboardPage.css";

import { fetchSalesSummary } from "../../api/receipt/receiptApi";
import { getAllPayments } from "../../api/payment/paymentApi";
import { getPurchaseOrders } from "../../api/purchaseOrder/purchaseOrderApi";
import { getStockTransactions } from "../../api/stock/transactionApi";
import { getProducts } from "../../api/product/productApi";

import DashboardTopList from "./dashboard/DashboardTopList";
import DashboardKpiRow, { KpiCardItem } from "./dashboard/DashboardKpiRow";
import DashboardPieChartCard from "./dashboard/DashboardPieChartCard";
import DashboardLineChartCard from "./dashboard/DashboardLineChartCard";
import DashboardTimeline from "./dashboard/DashboardTimeline";
import { resolveApprovedPurchaseTotal } from "../../utils/purchaseOrders";

type RangeKey = "daily" | "weekly" | "monthly" | "yearly";

type PaymentEntry = {
  id: string;
  paymentMethod: string;
  amount: number;
  timestamp?: string;
};

type PurchaseOrderEntry = {
  id: string;
  supplierName: string;
  createdAt?: string;
  items: any[];
  total: number;
  stockLots: any[];
};

type StockTimelineEntry = {
  id: string;
  timestamp?: string;
  type: string;
  reference?: string;
  productName: string;
  quantity: number;
};

const COLORS = ["#6C5CE7", "#00C49F", "#FFA62B", "#FF6B6B", "#845EC2", "#2D9CDB", "#F97316"]; // used in charts

const toBangkokDate = (value: Date) =>
  new Date(value.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));

const getRangeBounds = (range: RangeKey, selected: Date) => {
  const base = toBangkokDate(selected);
  if (range === "daily") {
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  if (range === "weekly") {
    const baseStart = new Date(base);
    baseStart.setHours(0, 0, 0, 0);
    const day = baseStart.getDay();
    const diffToMonday = (day + 6) % 7;
    baseStart.setDate(baseStart.getDate() - diffToMonday);
    const end = new Date(baseStart);
    end.setDate(end.getDate() + 7);
    return { start: baseStart, end };
  }

  if (range === "monthly") {
    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
    const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return { start: monthStart, end: monthEnd };
  }

  const yearStart = new Date(base.getFullYear(), 0, 1);
  const yearEnd = new Date(base.getFullYear() + 1, 0, 1);
  return { start: yearStart, end: yearEnd };
};

const getPreviousRangeBounds = (range: RangeKey, selected: Date) => {
  const current = getRangeBounds(range, selected);
  const duration = current.end.getTime() - current.start.getTime();
  const prevEnd = new Date(current.start);
  const prevStart = new Date(current.start.getTime() - duration);
  return { start: prevStart, end: prevEnd };
};

const isDateInRange = (date: Date, range: { start: Date; end: Date }) =>
  date >= range.start && date < range.end;

const formatCurrency = (value: number) =>
  `฿${Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const sanitizeNumber = (value: any) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const SALES_EMPTY_STATE = "ไม่พบข้อมูลยอดขายในช่วงที่เลือก";

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<RangeKey>("daily");

  const [summaryData, setSummaryData] = useState<any | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderEntry[]>([]);
  const [stockTransactions, setStockTransactions] = useState<StockTimelineEntry[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        setUserRole(typeof decoded?.role === "string" ? decoded.role : null);
      } catch (err) {
        console.warn("ไม่สามารถถอดรหัสโทเคนได้", err);
        setUserRole(null);
      }
    } else {
      setUserRole(null);
    }
    setAuthChecked(true);
  }, []);

  const isAdmin = (userRole || "").toLowerCase() === "admin";

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    if (!isAdmin) {
      setSummaryData(null);
      setPayments([]);
      setPurchaseOrders([]);
      setStockTransactions([]);
      setProducts([]);
      setLoading(false);
      return;
    }
    let ignore = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token") || "";
        const [salesRes, paymentRes, purchaseRes, stockRes, productRes] = await Promise.all([
          fetchSalesSummary(selectedDate, filter),
          getAllPayments(),
          token ? getPurchaseOrders(token) : Promise.resolve(null),
          token ? getStockTransactions(token) : Promise.resolve(null),
          token ? getProducts() : Promise.resolve(null),
        ]);

        if (ignore) return;

        if (salesRes?.success) {
          setSummaryData(salesRes.data || null);
        } else {
          setSummaryData(null);
        }

        const paymentListRaw = Array.isArray(paymentRes?.data)
          ? paymentRes.data
          : Array.isArray(paymentRes)
          ? paymentRes
          : [];
        const paymentSanitized: PaymentEntry[] = paymentListRaw
          .filter(Boolean)
          .map((item: any) => ({
            id: String(item?._id || item?.id || item?.saleId || Math.random()),
            paymentMethod: item?.paymentMethod || item?.method || "ไม่ระบุ",
            amount: sanitizeNumber(
              item?.amount ?? item?.total ?? item?.totalAmount ?? item?.netAmount
            ),
            timestamp:
              item?.createdAt ||
              item?.updatedAt ||
              item?.paidAt ||
              item?.paymentDate ||
              item?.timestamp,
          }));
        setPayments(paymentSanitized);

        const purchaseRaw = Array.isArray(purchaseRes?.data)
          ? purchaseRes.data
          : Array.isArray(purchaseRes)
          ? purchaseRes
          : [];
        const purchaseSanitized: PurchaseOrderEntry[] = purchaseRaw
          .filter(Boolean)
          .map((po: any) => {
            const items = Array.isArray(po?.items) ? po.items : [];
            const totalCandidate =
              po?.totalAmount ?? po?.total ?? po?.totalCost ?? po?.grandTotal ?? 0;
            return {
              id: String(po?._id || po?.id || po?.purchaseOrderNumber || Math.random()),
              supplierName:
                po?.supplierCompany ||
                po?.supplier?.companyName ||
                po?.supplier?.name ||
                "ไม่ระบุ",
              createdAt:
                po?.createdAt || po?.orderedAt || po?.date || po?.invoiceDate || po?.updatedAt,
              items,
              total: sanitizeNumber(totalCandidate),
              stockLots: Array.isArray(po?.stockLots) ? po.stockLots : [],
            };
          });
        setPurchaseOrders(purchaseSanitized);

        const stockRaw = Array.isArray(stockRes?.data)
          ? stockRes.data
          : Array.isArray(stockRes)
          ? stockRes
          : [];
        const stockSanitized: StockTimelineEntry[] = stockRaw
          .filter(Boolean)
          .map((tx: any, index: number) => ({
            id: String(tx?._id || tx?.id || tx?.reference || index),
            timestamp: tx?.createdAt || tx?.timestamp || tx?.date,
            type: (tx?.type || tx?.action || tx?.direction || "").toString(),
            reference:
              tx?.reference ||
              tx?.referenceId ||
              tx?.poCode ||
              tx?.docNo ||
              tx?.orderCode ||
              "-",
            productName: tx?.productName || tx?.itemName || tx?.product?.name || "-",
            quantity: sanitizeNumber(tx?.quantity ?? tx?.qty),
          }));
        setStockTransactions(stockSanitized);

        const productListRaw = Array.isArray(productRes?.data)
          ? productRes.data
          : Array.isArray(productRes)
          ? productRes
          : [];
        setProducts(productListRaw);
      } catch (err) {
        console.error("โหลดแดชบอร์ดไม่สำเร็จ", err);
        if (!ignore) {
          setError("ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [filter, selectedDate, isAdmin, authChecked]);

  const currentRange = useMemo(() => getRangeBounds(filter, selectedDate), [filter, selectedDate]);
  const previousRange = useMemo(
    () => getPreviousRangeBounds(filter, selectedDate),
    [filter, selectedDate]
  );
  const currentRangeKey = `${currentRange.start.getTime()}-${currentRange.end.getTime()}`;
  const previousRangeKey = `${previousRange.start.getTime()}-${previousRange.end.getTime()}`;

  const summary = summaryData?.summary?.[filter] || {};
  const changes = summaryData?.changes?.[filter] || {};

  const imageMap = useMemo(
    () =>
      new Map(
        (products || []).map((product: any) => [
          product?.productId?.barcode || product?.barcode,
          product?.productId?.imageUrl || product?.imageUrl,
        ])
      ),
    [products]
  );

  const topProducts = useMemo(() => {
    const base = summaryData?.topProducts?.[filter] || [];
    const filtered = base.filter((item: any) => {
      const qty = sanitizeNumber(item?.quantity);
      const revenue = sanitizeNumber(item?.netRevenue ?? item?.revenue);
      return qty > 0 || revenue > 0;
    });

    return filtered.slice(0, 5).map((item: any, idx: number) => ({
      rank: idx + 1,
      name: item?.name || item?.productName || "-",
      quantity: sanitizeNumber(item?.quantity),
      revenue: sanitizeNumber(item?.netRevenue ?? item?.revenue),
      imageUrl:
        item?.imageUrl ||
        item?.product?.imageUrl ||
        item?.productId?.imageUrl ||
        imageMap.get(item?.barcode || item?.productId?.barcode || item?.product?.barcode),
    }));
  }, [summaryData, filter, imageMap]);

  const salesSeries = useMemo(() => {
    const dataset = summaryData?.[filter] || [];
    const points = dataset
      .map((entry: any) => {
        const iso = entry?.formattedDate?.iso || entry?.date;
        if (!iso) return null;
        const date = toBangkokDate(new Date(iso));
        let label: string;
        let sortValue: number;
        if (filter === "daily") {
          label = date.toLocaleTimeString("th-TH", { hour: "2-digit" });
          sortValue = date.getHours();
        } else if (filter === "yearly") {
          label = date.toLocaleDateString("th-TH", { month: "short", year: "numeric" });
          sortValue = date.getTime();
        } else {
          label = date.toLocaleDateString("th-TH", { day: "2-digit", month: "short" });
          sortValue = date.getTime();
        }
        const value = sanitizeNumber(entry?.netSales ?? entry?.totalSales);
        return { label, value, sortValue };
      })
      .filter(Boolean) as Array<{ label: string; value: number; sortValue: number }>;
    return points
      .sort((a, b) => a.sortValue - b.sortValue)
      .map((point) => ({ label: point.label, value: point.value }));
  }, [summaryData, filter]);

  const profitTrendSeries = useMemo(() => {
    const dataset = summaryData?.[filter] || [];
    const points = dataset
      .map((entry: any) => {
        const iso = entry?.formattedDate?.iso || entry?.date;
        if (!iso) return null;
        const date = toBangkokDate(new Date(iso));
        let label: string;
        let sortValue: number;
        if (filter === "daily") {
          const hour = date.getHours();
          label = `${String(hour).padStart(2, "0")}:00`;
          sortValue = hour;
        } else if (filter === "yearly") {
          label = date.toLocaleDateString("th-TH", { month: "short", year: "numeric" });
          sortValue = date.getTime();
        } else {
          label = date.toLocaleDateString("th-TH", {
            day: "2-digit",
            month: "short",
          });
          sortValue = date.getTime();
        }
        const value = sanitizeNumber(
          entry?.totalProfit ?? entry?.profit ?? entry?.netProfit ?? entry?.margin
        );
        return { label, value, sortValue };
      })
      .filter(Boolean) as Array<{ label: string; value: number; sortValue: number }>;

    return points
      .sort((a, b) => a.sortValue - b.sortValue)
      .map((point) => ({ label: point.label, value: point.value }));
  }, [summaryData, filter]);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      if (!payment.timestamp) return false;
      const date = toBangkokDate(new Date(payment.timestamp));
      return isDateInRange(date, currentRange);
    });
  }, [payments, currentRangeKey]);

  const paymentPieData = useMemo(() => {
    const methodMap = new Map<string, number>();
    filteredPayments.forEach((payment) => {
      const method = payment.paymentMethod || "ไม่ระบุ";
      methodMap.set(method, (methodMap.get(method) || 0) + payment.amount);
    });
    return Array.from(methodMap.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredPayments]);

  const filteredPurchaseOrders = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (!po.createdAt) return false;
      const date = toBangkokDate(new Date(po.createdAt));
      return isDateInRange(date, currentRange);
    });
  }, [purchaseOrders, currentRangeKey]);

  const previousPurchaseOrders = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (!po.createdAt) return false;
      const date = toBangkokDate(new Date(po.createdAt));
      return isDateInRange(date, previousRange);
    });
  }, [purchaseOrders, previousRangeKey]);

  const poPieEntries = useMemo(() => {
    const supplierMap = new Map<string, number>();
    filteredPurchaseOrders.forEach((po) => {
      const value = resolveApprovedPurchaseTotal(po);
      if (value <= 0) return;
      const supplier = po.supplierName || "ไม่ระบุ";
      supplierMap.set(supplier, (supplierMap.get(supplier) || 0) + value);
    });
    return Array.from(supplierMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredPurchaseOrders]);

  const poPie = useMemo(() => poPieEntries.slice(0, 8), [poPieEntries]);

  const poExpenseInRange = useMemo(
    () => poPieEntries.reduce((sum, entry) => sum + entry.value, 0),
    [poPieEntries]
  );

  const previousPoExpenseInRange = useMemo(
    () =>
      previousPurchaseOrders.reduce(
        (sum, po) => sum + resolveApprovedPurchaseTotal(po),
        0
      ),
    [previousPurchaseOrders]
  );

  const poExpenseChange = useMemo(() => {
    if (previousPoExpenseInRange === 0) return null;
    return (
      ((poExpenseInRange - previousPoExpenseInRange) / previousPoExpenseInRange) * 100
    );
  }, [poExpenseInRange, previousPoExpenseInRange]);

  const timelineItems = useMemo(() => {
    return [...stockTransactions]
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 8)
      .map((item, index) => {
        const date = item.timestamp
          ? toBangkokDate(new Date(item.timestamp))
          : null;
        const timeText = date
          ? date.toLocaleString("th-TH", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "ไม่ระบุเวลา";
        const direction = (item.type || "").toUpperCase();
        const isOutgoing = /(SALE|OUT|REMOVE|ADJUSTMENT-NEG|REDUCE)/.test(direction);
        return {
          id: `${item.id}-${index}`,
          name: item.productName || "-",
          reference: item.reference || "-",
          type: direction || "-",
          quantity: item.quantity,
          timeText,
          direction: isOutgoing ? "out" : "in",
        };
      });
  }, [stockTransactions]);

  const totalNetSales = sanitizeNumber(
    typeof summary?.netSales === "number" ? summary.netSales : summary?.totalSales
  );
  const totalProfit = sanitizeNumber(summary?.totalProfit);
  const totalQuantity = sanitizeNumber(summary?.totalQuantity);

  const salesChange =
    typeof changes?.netSalesChange === "number"
      ? changes.netSalesChange
      : typeof changes?.totalSalesChange === "number"
      ? changes.totalSalesChange
      : null;
  const profitChange =
    typeof changes?.totalProfitChange === "number" ? changes.totalProfitChange : null;
  const quantityChange =
    typeof changes?.totalQuantityChange === "number" ? changes.totalQuantityChange : null;

  const kpiItems: KpiCardItem[] = [
    {
      id: "net-sales",
      title: "ยอดขายสุทธิ",
      value: formatCurrency(totalNetSales),
      change: salesChange,
      changeText: "เทียบช่วงก่อนหน้า",
    },
    {
      id: "profit",
      title: "กำไรรวม",
      value: formatCurrency(totalProfit),
      change: profitChange,
      changeText: "เทียบช่วงก่อนหน้า",
    },
    {
      id: "po-expense",
      title: "ค่าใช้จ่ายใบสั่งซื้อ",
      value: formatCurrency(poExpenseInRange),
      change: poExpenseChange,
      changeText: "เทียบช่วงก่อนหน้า",
      footnote: "รวมใบสั่งซื้อในช่วงที่เลือก",
    },
    {
      id: "quantity",
      title: "จำนวนสินค้าที่ขาย",
      value: `${totalQuantity.toLocaleString("th-TH") || 0} ชิ้น`,
      change: quantityChange,
      changeText: "เทียบช่วงก่อนหน้า",
    },
  ];

  const formatPaymentValue = (value: number) =>
    `฿${value.toLocaleString("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;

  if (!authChecked) {
    return (
      <div className="display">
        <div className="dashboard-page">
          <div className="dashboard-loading">กำลังตรวจสอบสิทธิ์...</div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="display">
        <div className="dashboard-page">
          <div className="dashboard-guard-message">
            หน้านี้สำหรับผู้ดูแลระบบเท่านั้น กรุณาติดต่อผู้ดูแลเพื่อขอสิทธิ์เข้าถึง
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="display">
      <div className="dashboard-page">
        <div className="dashboard-heading">
          <h1>📊 ภาพรวมธุรกิจ</h1>
          <div className="dashboard-controls">
            <div className="filters">
              {(["daily", "weekly", "monthly", "yearly"] as RangeKey[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={filter === type ? "active" : ""}
                  onClick={() => setFilter(type)}
                >
                  {type === "daily"
                    ? "รายวัน"
                    : type === "weekly"
                    ? "รายสัปดาห์"
                    : type === "monthly"
                    ? "รายเดือน"
                    : "รายปี"}
                </button>
              ))}
            </div>
            <DatePicker
              selected={selectedDate}
              onChange={(date) => date && setSelectedDate(date)}
              locale={th}
              dateFormat={
                filter === "monthly"
                  ? "MMMM yyyy"
                  : filter === "yearly"
                  ? "yyyy"
                  : "dd MMMM yyyy"
              }
              showMonthYearPicker={filter === "monthly"}
              showYearPicker={filter === "yearly"}
              className="date-picker"
            />
          </div>
        </div>

      {error && <div className="dashboard-error">{error}</div>}

      <div className="dashboard-grid">
        <section className="dashboard-card area-top-list">
          <h2>สินค้าขายดี Top 5</h2>
          <DashboardTopList
            items={topProducts}
            loading={loading}
            emptyMessage="ยังไม่มีการขายสินค้าในช่วงนี้"
          />
        </section>

        <section className="dashboard-card area-kpis">
          <h2>ตัวชี้วัดหลัก</h2>
          <DashboardKpiRow items={kpiItems} loading={loading} />
        </section>

        <section className="dashboard-card area-sales">
          <h2>กราฟยอดขายตามช่วงเวลา</h2>
          <span className="card-subtitle">ยอดขายสุทธิจากใบเสร็จ</span>
          <DashboardLineChartCard
            data={salesSeries}
            loading={loading}
            emptyMessage={SALES_EMPTY_STATE}
            color={COLORS[0]}
            type="line"
            valueFormatter={(value) =>
              `฿${Number(value).toLocaleString("th-TH", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}`
            }
          />
        </section>

        <section className="dashboard-card area-po-pie">
          <h2>สัดส่วนค่าใช้จ่ายใบสั่งซื้อ</h2>
          <span className="card-subtitle">แยกตามซัพพลายเออร์</span>
          <DashboardPieChartCard
            data={poPie}
            loading={loading}
            emptyMessage="ยังไม่มีค่าใช้จ่ายใบสั่งซื้อในช่วงนี้"
            colors={COLORS}
            valueFormatter={formatPaymentValue}
          />
        </section>

        <section className="dashboard-card area-pay-history">
          <h2>แนวโน้มการเติบโตของกำไร</h2>
          <span className="card-subtitle">กำไรสุทธิตามช่วงเวลา</span>
          <DashboardLineChartCard
            data={profitTrendSeries}
            loading={loading}
            emptyMessage="ยังไม่มีกำไรในช่วงนี้"
            color={COLORS[1]}
            type="area"
            valueFormatter={formatCurrency}
          />
        </section>

        <section className="dashboard-card area-pay-pie">
          <h2>วิธีการชำระเงินยอดนิยม</h2>
          <span className="card-subtitle">เทียบตามมูลค่าการชำระเงิน</span>
          <DashboardPieChartCard
            data={paymentPieData}
            loading={loading}
            emptyMessage="ยังไม่มีข้อมูลการชำระเงินในช่วงนี้"
            colors={COLORS}
            valueFormatter={formatPaymentValue}
          />
        </section>
        
      </div>
    </div>
    </div>
  );
}