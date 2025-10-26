import React, { useEffect, useMemo, useState } from "react";
import { jwtDecode } from "jwt-decode";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  Area,
  Label,
} from "recharts";

import "../../styles/page/HomePage.css";

// === APIs ===
import { fetchSalesSummary } from "../../api/receipt/receiptApi";
import { getAllPayments } from "../../api/payment/paymentApi";
import { getPurchaseOrders } from "../../api/purchaseOrder/purchaseOrderApi";
import { getStockTransactions } from "../../api/stock/transactionApi";
import { getProducts } from "../../api/product/productApi";

import TopProductsSlider from "./TopProductsSlider";

const COLORS = [
  "#6C5CE7",
  "#00C49F",
  "#FF6B6B",
  "#FFA62B",
  "#5AD8A6",
  "#845EC2",
];
const GRADIENTS = {
  purple: { id: "gPurple", from: "#6C5CE7", to: "rgba(108,92,231,0.12)" },
};

const LINE_CHART_HEIGHT = 320;
const PIE_CHART_HEIGHT = 300;
type RangeKey = "daily" | "weekly" | "monthly";
const DEFAULT_IMG = "https://cdn-icons-png.flaticon.com/512/2331/2331970.png";

type PaymentEntry = {
  id: string;
  saleId: string;
  paymentMethod: string;
  amount: number;
  profit: number;
  employeeName: string;
  status: string;
  type: string;
  createdAt?: string;
  updatedAt?: string;
};

type PurchaseOrderEntry = {
  id: string;
  supplierName: string;
  createdAt?: string;
  items: any[];
  stockLots: any[];
};

type StockTimelineEntry = {
  id: string;
  createdAt?: string;
  type: string;
  reference: string;
  productName: string;
  barcode: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  locationName: string;
  supplierName: string;
  notes: string;
  userName: string;
  tone: "in" | "out" | "adjust";
  typeLabel: string;
  poNumber: string;
};

const sanitizeNumber = (value: any) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

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
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    const diff = (day + 6) % 7; // shift so that Monday is the first day of the week
    start.setDate(start.getDate() - diff);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return { start, end };
};

const isDateInRange = (date: Date, range: { start: Date; end: Date }) =>
  date >= range.start && date < range.end;

const formatCurrency = (value: number) =>
  `฿${Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const formatPaymentDateTime = (stamp?: string) => {
  if (!stamp) return "-";
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "-";
  const bangkokDate = toBangkokDate(date);
  return (
    bangkokDate
      .toLocaleString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace("น.", "")
      .trim() + " น."
  );
};

const describePaymentMethod = (method: string) => {
  const value = (method || "").toString().toLowerCase();
  if (value.includes("card") || value.includes("บัตร")) return "💳 บัตรเครดิต";
  if (value.includes("qr")) return "📱 QR Code";
  if (value.includes("cash") || value.includes("เงินสด")) return "💵 เงินสด";
  if (value.includes("bank") || value.includes("transfer") || value.includes("โอน")) {
    return "🏦 โอนธนาคาร";
  }
  if (value.includes("prompt") || value.includes("พร้อมเพย์")) return "📲 พร้อมเพย์";
  if (!value) return "💠 ไม่ระบุ";
  return `💠 ${method}`;
};

const describePaymentStatus = (status: string) => {
  const value = (status || "").toString().toLowerCase();
  if (value.includes("สำเร็จ") || value.includes("success")) return "✅ สำเร็จ";
  if (value.includes("ล้มเหลว") || value.includes("fail")) return "❌ ล้มเหลว";
  if (value.includes("รอดำเนินการ") || value.includes("pending")) return "⏳ รอดำเนินการ";
  if (!value) return "⏳ รอดำเนินการ";
  return status;
};

const describePaymentType = (type: string, amount: number) => {
  const normalized = (type || "").toString().trim().toUpperCase();
  if (normalized.includes("REFUND")) return "🔴 คืนเงิน";
  if (normalized.includes("SALE")) return "🟢 ขาย";
  if (normalized.includes("CANCEL")) return "⚪ ยกเลิก";
  if (normalized.includes("HOLD") || normalized.includes("PENDING")) return "⏸️ รอชำระ";
  if (!normalized) {
    if (Number(amount) < 0) return "🔴 คืนเงิน";
    if (Number(amount) === 0) return "⚪ อื่นๆ";
    return "🟢 ขาย";
  }
  return `⚪ ${type}`;
};

const STOCK_TYPE_META: Record<
  string,
  { label: string; tone: "in" | "out" | "adjust" }
> = {
  RESTOCK: { label: "รับเข้า", tone: "in" },
  RETURN: { label: "รับคืน", tone: "in" },
  TRANSFER_IN: { label: "โอนเข้า", tone: "in" },
  TRANSFER_OUT: { label: "โอนออก", tone: "out" },
  SALE: { label: "ขายออก", tone: "out" },
  ISSUE: { label: "ตัดสต็อก", tone: "out" },
  DAMAGE: { label: "สินค้าเสียหาย", tone: "out" },
  ADJUST: { label: "ปรับสต็อก", tone: "adjust" },
};

const resolveStockMeta = (rawType: string) => {
  const normalized = (rawType || "").toString().trim().toUpperCase();
  return (
    STOCK_TYPE_META[normalized] || {
      label: normalized || "ไม่ระบุ",
      tone: "adjust" as const,
    }
  );
};

export default function HomePage() {
  // ----- states -----
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [summaryData, setSummaryData] = useState<any>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderEntry[]>(
    []
  );
  const [stockTx, setStockTx] = useState<StockTimelineEntry[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [filter] = useState<RangeKey>("weekly");
  const [selectedDate] = useState<Date>(new Date());

  // ----- effects: top-level only -----
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        setUser(jwtDecode(token));
      } catch {}
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const [salesRes, payRes, poRes, txRes, prodRes] = await Promise.all([
          fetchSalesSummary(selectedDate, filter),
          getAllPayments(),
          getPurchaseOrders(token),
          getStockTransactions(token),
          getProducts(),
        ]);

        if (salesRes?.success) setSummaryData(salesRes.data || null);

        const payRaw = Array.isArray(payRes?.data)
          ? payRes.data
          : Array.isArray(payRes)
          ? payRes
          : [];
        const paymentSanitized: PaymentEntry[] = payRaw
          .filter(Boolean)
          .map((item: any, index: number) => {
            const amount = sanitizeNumber(
              item?.amount ??
                item?.total ??
                item?.totalAmount ??
                item?.netAmount ??
                item?.grandTotal
            );
            const rawType = (
              item?.type ||
              item?.transactionType ||
              item?.paymentType ||
              item?.category ||
              ""
            )
              .toString()
              .trim();
            const normalizedType = rawType
              ? rawType.toUpperCase()
              : amount < 0
              ? "REFUND"
              : amount === 0
              ? "OTHER"
              : "SALE";

            return {
              id: String(item?._id || item?.id || item?.saleId || index),
              saleId: String(
                item?.saleId ||
                  item?.saleCode ||
                  item?.reference ||
                  item?.orderId ||
                  "-"
              ),
              paymentMethod:
                item?.paymentMethod ||
                item?.method ||
                item?.channel ||
                "ไม่ระบุ",
              amount,
              profit: sanitizeNumber(
                item?.profit ?? item?.netProfit ?? item?.totalProfit ?? item?.margin
              ),
              employeeName:
                item?.employeeName ||
                item?.cashier?.name ||
                item?.employee?.name ||
                item?.user?.name ||
                item?.staffName ||
                "-",
              status: item?.status || item?.state || item?.paymentStatus || "ไม่ระบุ",
              type: normalizedType,
              createdAt:
                item?.createdAt ||
                item?.paidAt ||
                item?.paymentDate ||
                item?.timestamp,
              updatedAt:
                item?.updatedAt ||
                item?.modifiedAt ||
                item?.paymentDate ||
                item?.timestamp,
            };
          });
        setPayments(paymentSanitized);

        const poRaw = Array.isArray(poRes?.data)
          ? poRes.data
          : Array.isArray(poRes)
          ? poRes
          : [];
        const purchaseSanitized: PurchaseOrderEntry[] = poRaw
          .filter(Boolean)
          .map((po: any, index: number) => ({
            id: String(po?._id || po?.id || po?.purchaseOrderNumber || index),
            supplierName:
              po?.supplierCompany ||
              po?.supplier?.companyName ||
              po?.supplier?.name ||
              "ไม่ระบุ",
            createdAt:
              po?.createdAt ||
              po?.orderedAt ||
              po?.date ||
              po?.invoiceDate ||
              po?.updatedAt,
            items: Array.isArray(po?.items) ? po.items : [],
            stockLots: Array.isArray(po?.stockLots) ? po.stockLots : [],
          }));
        setPurchaseOrders(purchaseSanitized);

        const txRaw = Array.isArray(txRes?.data)
          ? txRes.data
          : Array.isArray(txRes)
          ? txRes
          : [];
        const stockSanitized: StockTimelineEntry[] = txRaw
          .filter(Boolean)
          .map((tx: any, index: number) => {
            const product =
              tx?.productId ||
              tx?.product ||
              tx?.stockId?.productId ||
              tx?.stockLotId?.productId ||
              {};
            const stock = tx?.stockId || {};
            const lot = tx?.stockLotId || {};
            const user = tx?.userId || tx?.user || {};
            const typeRaw = (tx?.type || tx?.action || tx?.direction || "").toString();
            const { label: typeLabel, tone } = resolveStockMeta(typeRaw);
            const baseQty = sanitizeNumber(
              tx?.quantity ?? tx?.qty ?? lot?.quantity ?? stock?.quantity
            );

            const locationName =
              tx?.location?.name ||
              tx?.locationName ||
              stock?.location?.name ||
              stock?.locationName ||
              (typeof stock?.location === "string" ? stock.location : undefined) ||
              lot?.location?.name ||
              lot?.locationName ||
              "";

            const supplierName =
              tx?.supplierName ||
              tx?.supplier ||
              stock?.supplier ||
              stock?.supplierName ||
              (typeof stock?.supplierId === "object"
                ? stock?.supplierId?.name
                : stock?.supplierId) ||
              product?.supplierName ||
              product?.supplier ||
              "";

            const poNumber =
              tx?.purchaseOrderNumber ||
              tx?.poNumber ||
              tx?.poCode ||
              lot?.purchaseOrderNumber ||
              lot?.poNumber ||
              "";

            const reference =
              tx?.reference ||
              tx?.referenceId ||
              tx?.docNo ||
              tx?.orderCode ||
              tx?.orderId ||
              poNumber ||
              lot?.batchNumber ||
              "-";

            const costPrice = sanitizeNumber(
              tx?.costPrice ??
                lot?.costPrice ??
                stock?.costPrice ??
                product?.costPrice ??
                product?.purchasePrice
            );

            const salePrice = sanitizeNumber(
              tx?.salePrice ??
                lot?.salePrice ??
                stock?.salePrice ??
                product?.salePrice ??
                product?.price
            );

            const userName = [user?.firstName, user?.lastName]
              .filter(Boolean)
              .join(" ")
              .trim();

            return {
              id: String(tx?._id || tx?.id || tx?.reference || index),
              createdAt:
                tx?.createdAt ||
                tx?.timestamp ||
                tx?.date ||
                lot?.createdAt ||
                stock?.createdAt,
              type: typeRaw,
              reference,
              productName:
                product?.name ||
                tx?.productName ||
                tx?.itemName ||
                stock?.productName ||
                "-",
              barcode:
                product?.barcode ||
                tx?.barcode ||
                stock?.barcode ||
                lot?.barcode ||
                stock?.productId?.barcode ||
                "-",
              quantity: tone === "out" ? -Math.abs(baseQty) : baseQty,
              costPrice,
              salePrice,
              locationName: locationName || "-",
              supplierName: supplierName || "-",
              notes:
                tx?.notes ||
                tx?.remark ||
                tx?.description ||
                lot?.notes ||
                "",
              userName:
                userName ||
                user?.name ||
                user?.username ||
                user?.email ||
                "",
              tone,
              typeLabel,
              poNumber: poNumber || "-",
            };
          });
        setStockTx(stockSanitized);

        const prodList = Array.isArray(prodRes?.data)
          ? prodRes.data
          : Array.isArray(prodRes)
          ? prodRes
          : [];
        setProducts(prodList);
      } catch (e) {
        console.error("Load dashboard blocks failed:", e);
      }
    };
    load();
  }, [user, filter, selectedDate]);

  // ----- ALL hooks (useMemo) MUST be before any early return -----

  const currentRange = useMemo(
    () => getRangeBounds(filter, selectedDate),
    [filter, selectedDate]
  );
  const currentRangeKey = `${currentRange.start.getTime()}-${currentRange.end.getTime()}`;

  // 1) รูปสินค้าแมพจาก products
  const imageMap = useMemo(
    () =>
      new Map(
        (products || []).map((p: any) => [
          p.productId?.barcode || p.barcode,
          p.productId?.imageUrl || p.imageUrl,
        ])
      ),
    [products]
  );

  // 2) Payments ภายในช่วงที่เลือก
  const paymentsInRange = useMemo(
    () =>
      (payments || []).filter((p) => {
        const stamp = p?.createdAt || p?.updatedAt;
        if (!stamp) return false;
        const date = toBangkokDate(new Date(stamp));
        return isDateInRange(date, currentRange);
      }),
    [payments, currentRangeKey]
  );

  // 3) Top products (เติมรูป)
  const topProductsFromApi = useMemo(() => {
    const base = summaryData?.topProducts?.[filter] || [];
    return base.slice(0, 10).map((p: any, idx: number) => ({
      name: p.name,
      barcode: p.barcode,
      imageUrl: imageMap.get(p.barcode) || DEFAULT_IMG,
      quantity: p.quantity,
      revenue: p.revenue ?? p.netRevenue ?? 0,
      rank: idx + 1,
    }));
  }, [summaryData, imageMap, filter]);

  const summaryForRange = summaryData?.summary?.[filter] || {};
  const rangeLabel =
    filter === "daily" ? "วันนี้" : filter === "weekly" ? "สัปดาห์นี้" : "เดือนนี้";
  const lineTitle =
    filter === "daily"
      ? "กราฟยอดขายวันนี้ (รายชั่วโมง)"
      : filter === "weekly"
      ? "กราฟยอดขายสัปดาห์นี้ (รายวัน)"
      : "กราฟยอดขายเดือนนี้ (รายสัปดาห์)";

  const rangeEntries = useMemo(() => {
    const raw = Array.isArray(summaryData?.[filter]) ? summaryData[filter] : [];
    return raw
      .map((entry: any, idx: number) => {
        const iso = entry?.formattedDate?.iso || entry?.date || entry?.day;
        const baseDate = iso ? toBangkokDate(new Date(iso)) : null;
        if (!baseDate) return null;
        return {
          entry,
          baseDate,
          index: idx,
          sales: Number(entry?.netSales ?? entry?.totalSales ?? entry?.sales ?? 0),
          profit: Number(entry?.totalProfit ?? entry?.profit ?? entry?.netProfit ?? 0),
          quantity: Number(
            entry?.totalQuantity ??
              entry?.quantity ??
              entry?.soldQuantity ??
              entry?.units ??
              0
          ),
        };
      })
      .filter(
        (item): item is {
          entry: any;
          baseDate: Date;
          index: number;
          sales: number;
          profit: number;
          quantity: number;
        } => !!item && isDateInRange(item.baseDate, currentRange)
      );
  }, [summaryData, filter, currentRangeKey]);

  const hasRangeEntries = rangeEntries.length > 0;

  const aggregatedTotals = useMemo(
    () =>
      rangeEntries.reduce(
        (acc, item) => {
          acc.sales += item.sales;
          acc.profit += item.profit;
          acc.quantity += item.quantity;
          return acc;
        },
        { sales: 0, profit: 0, quantity: 0 }
      ),
    [rangeEntries]
  );

  const lineChartData = useMemo(() => {
    return rangeEntries
      .map((item) => {
        let label: string;
        let sortValue: number;
        if (filter === "daily") {
          const hour =
            typeof item.entry?.hour === "number"
              ? item.entry.hour
              : item.baseDate.getHours();
          label = `${String(hour).padStart(2, "0")}:00`;
          const marker = new Date(item.baseDate);
          marker.setHours(hour, 0, 0, 0);
          sortValue = marker.getTime();
        } else if (filter === "weekly") {
          label = item.baseDate.toLocaleDateString("th-TH", {
            day: "2-digit",
            month: "short",
          });
          sortValue = item.baseDate.getTime();
        } else {
          label =
            item.entry?.weekLabel ||
            item.entry?.label ||
            item.baseDate.toLocaleDateString("th-TH", {
              day: "2-digit",
              month: "short",
            });
          sortValue = item.entry?.weekIndex ?? item.index ?? item.baseDate.getTime();
        }
        return { label, value: item.sales, sortValue };
      })
      .sort((a, b) => a.sortValue - b.sortValue)
      .map((item) => ({ label: item.label, value: item.value }));
  }, [rangeEntries, filter]);

  const netSalesTotal = hasRangeEntries
    ? aggregatedTotals.sales
    : Number(summaryForRange?.netSales ?? summaryForRange?.totalSales ?? 0);
  const quantityTotal = hasRangeEntries
    ? aggregatedTotals.quantity
    : Number(summaryForRange?.totalQuantity ?? summaryForRange?.quantity ?? 0);
  const profitTotal = hasRangeEntries
    ? aggregatedTotals.profit
    : Number(summaryForRange?.totalProfit ?? summaryForRange?.profit ?? 0);

  const paymentPieRevenue = netSalesTotal;
  const paymentPieProfit = profitTotal;

  const paymentPie = useMemo(
    () => [
      { name: "กำไร", value: paymentPieProfit },
      {
        name: "รายได้หลังหักกำไร",
        value: Math.max(paymentPieRevenue - paymentPieProfit, 0),
      },
    ],
    [paymentPieRevenue, paymentPieProfit]
  );

  const purchaseInRange = useMemo(
    () =>
      (purchaseOrders || []).filter((po) => {
        if (!po?.createdAt) return false;
        const date = toBangkokDate(new Date(po.createdAt));
        return isDateInRange(date, currentRange);
      }),
    [purchaseOrders, currentRangeKey]
  );

  const poPieEntries = useMemo(() => {
    const approvedTotalsByProduct: Record<string, { name: string; value: number }> = {};
    purchaseInRange.forEach((po: any) => {
      const approvedBatches = new Set(
        (po.stockLots || [])
          .filter((s: any) => (s.qcStatus || "").trim() === "ผ่าน")
          .map((s: any) => s.batchNumber)
      );
      (po.items || []).forEach((it: any) => {
        const batch = it.batchNumber || "";
        if (!approvedBatches.has(batch)) return;
        const name = it.productName || it.productId?.name || "-";
        const total = Number(
          it.total ?? (it.costPrice || 0) * (it.quantity || 0)
        );
        approvedTotalsByProduct[name] = {
          name,
          value: (approvedTotalsByProduct[name]?.value || 0) + total,
        };
      });
    });
    return Object.values(approvedTotalsByProduct).sort((a, b) => b.value - a.value);
  }, [purchaseInRange]);

  const poPie = useMemo(() => poPieEntries.slice(0, 8), [poPieEntries]);

  const poExpenseInRange = useMemo(
    () => poPieEntries.reduce((sum, entry) => sum + entry.value, 0),
    [poPieEntries]
  );

  const stockTimeline = useMemo(() => {
    return [...(stockTx || [])]
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      )
      .map((row) => {
        const stamp = row.createdAt ? toBangkokDate(new Date(row.createdAt)) : null;
        const when = stamp
          ? stamp.toLocaleString("th-TH", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-";
        return {
          id: row.id,
          when,
          tone: row.tone || "adjust",
          type: row.type || "-",
          typeLabel: row.typeLabel || row.type || "-",
          name: row.productName || "-",
          barcode: row.barcode && row.barcode !== "-" ? row.barcode : "",
          reference: row.reference || "-",
          quantity: Number(row.quantity ?? 0),
          userName: row.userName?.trim() ? row.userName : "",
        };
      });
  }, [stockTx]);

  // ----- จากนี้จะมี early return ได้ เพราะ hooks ทั้งหมดข้างบนถูกเรียกทุกครั้งแล้ว -----
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 50 }}>
        ⏳ กำลังตรวจสอบผู้ใช้...
      </div>
    );
  }
  if (!user) {
    return (
      <div className="display">
        <div className="home-container">
          {/* ส่วนข้อความต้อนรับ */}
          <div className="text-section">
            <h1 className="welcome-title">ยินดีต้อนรับสู่ระบบ POS</h1>
            <p className="description">
              ระบบที่ช่วยให้การขายของคุณเป็นเรื่องง่ายและสะดวกยิ่งขึ้น
              รองรับการจัดการสินค้า รายงานยอดขาย และสต็อกสินค้าในที่เดียว!
            </p>

            {/* จุดเด่นของระบบ */}
            <div className="features">
              <div className="feature-item">
                ✅ <strong>จัดการสินค้า:</strong> เพิ่ม ลบ
                แก้ไขข้อมูลสินค้าได้ง่าย
              </div>
              <div className="feature-item">
                📊 <strong>รายงานยอดขาย:</strong> ดูสรุปยอดขายแบบเรียลไทม์
              </div>
              <div className="feature-item">
                📦 <strong>ระบบสต็อก:</strong>{" "}
                ควบคุมปริมาณสินค้าให้อยู่ในระดับที่เหมาะสม
              </div>
              <div className="feature-item">
                💳 <strong>รองรับการชำระเงิน:</strong> รับชำระเงินหลายช่องทาง
              </div>
            </div>
          </div>

          {/* ส่วนรูปภาพประกอบ */}
          <div className="image-section">
            <img
              className="pos-image"
              src="https://res.cloudinary.com/dboau6axv/image/upload/v1738153705/pos_ozpgmv.jpg"
              alt="POS System"
            />
          </div>
        </div>
      </div>
    );
  }
  if (!summaryData) {
    return <div style={{ textAlign: "center", padding: 50 }}>⏳ กำลังโหลดข้อมูล...</div>;
  }

  // ====== UI ======
  return (
    <div className="display">
      <div className="home-gradient">
      <div className="dashboard-overview">
        <div className="dash-grid">
          {/* Top 5 */}
          <section className="panel card-like area-top5">
            <h2 className="section-title">สินค้าขายดี (Top 5)</h2>
            <TopProductsSlider
              items={topProductsFromApi.slice(0, 5)}
            />
          </section>

          {/* เส้นรายชั่วโมง */}
          <section className="panel card-like area-receipt">
            <h2 className="section-title">{lineTitle}</h2>
            <div className="chart-rect">
              <ResponsiveContainer width="100%" height={LINE_CHART_HEIGHT}>
                <LineChart
                  data={lineChartData}
                  margin={{ top: 20, right: 24, bottom: 28, left: 12 }}
                >
                  <defs>
                    <linearGradient
                      id={GRADIENTS.purple.id}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={GRADIENTS.purple.from}
                        stopOpacity={0.9}
                      />
                      <stop
                        offset="100%"
                        stopColor={GRADIENTS.purple.to}
                        stopOpacity={0.4}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatCurrency(Number(v))} />
                  <Line type="monotone" dataKey="value" stroke="#6C5CE7" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="value" stroke="none" fill="url(#gPurple)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* พาย 1: Payments */}
          <section className="panel card-like area-pie1">
            <h2 className="section-title">รายได้ & กำไรรวม ({rangeLabel})</h2>
            <div className="pie-rect">
              <ResponsiveContainer width="100%" height={PIE_CHART_HEIGHT}>
                <PieChart margin={{ top: 10, right: 20, left: 20, bottom: 32 }}>
                  <Tooltip formatter={(v: number) => formatCurrency(Number(v))} />
                  <Legend verticalAlign="bottom" height={48} />
                  <Pie
                    data={paymentPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    labelLine={false}
                  >
                    {paymentPie.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                    <Label
                      value={formatCurrency(paymentPieRevenue)}
                      position="center"
                      style={{ fontWeight: 700, fontSize: 15 }}
                    />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* พาย 2: PO (QC ผ่าน) */}
          <section className="panel card-like area-pie2">
            <h2 className="section-title">QC ผ่าน {rangeLabel}</h2>
            <div className="pie-rect">
              <ResponsiveContainer width="100%" height={PIE_CHART_HEIGHT}>
                <PieChart margin={{ top: 10, right: 20, left: 20, bottom: 24 }}>
                  <Tooltip formatter={(v: number) => formatCurrency(Number(v))} />
                  <Legend verticalAlign="bottom" height={44} />
                  <Pie
                    data={poPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={85}
                    labelLine={false}
                    paddingAngle={3}
                  >
                    {poPie.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* KPI */}
          <div className="kpi card-like area-kpi1">
            <div className="kpi-head">ยอดขายสุทธิ ({rangeLabel})</div>
            <div className="kpi-val">
              {formatCurrency(netSalesTotal)}
            </div>
          </div>
          <div className="kpi card-like area-kpi2">
            <div className="kpi-head">จำนวนที่ขาย ({rangeLabel})</div>
            <div className="kpi-val">{Number(quantityTotal).toLocaleString()} ชิ้น</div>
          </div>
          <div className="kpi card-like area-kpi3">
            <div className="kpi-head">กำไรรวม ({rangeLabel})</div>
            <div className="kpi-val">{formatCurrency(profitTotal)}</div>
          </div>
          <div className="kpi card-like area-kpi4">
            <div className="kpi-head">ค่าใช้จ่ายใบสั่งซื้อ ({rangeLabel})</div>
            <div className="kpi-val">{formatCurrency(poExpenseInRange)}</div>
          </div>

          {/* Stock transactions */}
          <section className="panel card-like area-timeline">
            <h2 className="section-title">ความเคลื่อนไหวสต็อกล่าสุด</h2>
            <div className="timeline-scroll">
              <div className="timeline">
                {stockTimeline.map((item) => {
                  const toneClass = item.tone === "out" ? "danger" : item.tone === "in" ? "success" : "info";
                  return (
                    <div key={item.id} className="timeline-item">
                      <div className={`dot ${item.tone}`} />
                      <div className="content">
                        <div className="line1">
                          <span className="when">{item.when}</span>
                          <span className={`pill ${toneClass}`}>{item.typeLabel}</span>
                        </div>
                        <div className="line2">
                          <span className="name">{item.name}</span>
                          <span className="qty">× {Number(item.quantity).toLocaleString()}</span>
                        </div>
                        <div className="line3 muted">
                          {item.barcode ? `บาร์โค้ด: ${item.barcode}` : ""}
                        </div>
                        {item.userName && (
                          <div className="line4 muted">พนักงาน: {item.userName}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {stockTimeline.length === 0 && <div className="muted">— ไม่มีข้อมูล —</div>}
              </div>
            </div>
          </section>

          {/* Payment history */}
          <section className="panel card-like area-payment">
            <h2 className="section-title">ประวัติการขาย {rangeLabel}</h2>
            <div className="table-scroll tall">
              <table className="nice-table payment-table home-payment-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>ลำดับ</th>
                    <th>รหัสขาย</th>
                    <th>พนักงาน</th>
                    <th>ประเภท</th>
                    <th>วิธีชำระ</th>
                    <th style={{ textAlign: "right" }}>ยอดชำระ</th>
                    <th>สถานะ</th>
                    <th>วันที่</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsInRange.map((p, idx) => {
                    const stamp = p.createdAt || p.updatedAt;
                    const amountValue = Number(p.amount ?? 0);
                    const amountColor = amountValue < 0 ? "#dc2626" : amountValue === 0 ? "#1f2937" : "#047857";
                    return (
                      <tr key={`${p.id}-${idx}`}>
                        <td>{idx + 1}</td>
                        <td>{p.saleId}</td>
                        <td>{p.employeeName}</td>
                        <td className="type-cell">{describePaymentType(p.type, amountValue)}</td>
                        <td>{describePaymentMethod(p.paymentMethod)}</td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 600,
                            color: amountColor,
                          }}
                        >
                          {formatCurrency(amountValue)}
                        </td>
                        <td className="status-cell">{describePaymentStatus(p.status)}</td>
                        <td>{formatPaymentDateTime(stamp)}</td>
                      </tr>
                    );
                  })}
                  {paymentsInRange.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", color: "#6b7280" }}>— ไม่มีรายการ —</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
    </div>
  );
}