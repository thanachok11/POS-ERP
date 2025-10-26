import { Request, Response } from "express";
import mongoose from "mongoose";
import Receipt from "../models/Receipt";
import Stock from "../models/Stock";
import User from "../models/User";
import Employee from "../models/Employee";
import { verifyToken } from "../utils/auth";

// ======================= Helper: resolve ownerId =======================
const getOwnerId = async (userId: string): Promise<string> => {
    let user = await User.findById(userId);
    if (!user) user = await Employee.findById(userId);
    if (!user) throw new Error("User not found");

    if (user.role === "admin") return user._id.toString();
    if (user.role === "employee") {
        if (!user.adminId) throw new Error("Employee does not have admin assigned");
        return user.adminId.toString();
    }
    throw new Error("Invalid user role");
};

// ======================= Helper Functions =======================

function formatThaiDate(date: Date) {
    return {
        thai: date.toLocaleString("th-TH", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
            hour: "2-digit",
            minute: "2-digit",
        }),
        iso: date.toISOString(),
    };
}

function fillHours(data: any[], start: Date) {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    return hours.map((h) => {
        const found = data.find((d) => d.hour === h);
        const date = new Date(start);
        date.setHours(h, 0, 0, 0);
        return {
            hour: h,
            totalSales: found?.totalSales || 0,
            totalQuantity: found?.totalQuantity || 0,
            netSales: found?.netSales || 0,
            totalProfit: found?.totalProfit || 0,
            bestSeller: found?.bestSeller || { name: "-", quantity: 0, revenue: 0 },
            formattedDate: formatThaiDate(date),
        };
    });
}

// ======================= Main Controller =======================
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
        // ✅ auth
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }
        const ownerId = await getOwnerId(decoded.userId);
        const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

        // ✅ date
        const inputDate = req.query.date ? new Date(req.query.date as string) : new Date();
        const _filter = (req.query.filter as string) || "daily";
        const localDate = new Date(
            new Date(inputDate).toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
        );

        // ranges
        const startOfDay = new Date(localDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(localDate); endOfDay.setHours(23, 59, 59, 999);

        const startOfWeek = new Date(localDate);
        startOfWeek.setDate(localDate.getDate() - localDate.getDay());
        // ทำให้จันทร์เป็นวันเริ่ม
        const dowMon0 = (localDate.getDay() + 6) % 7; // อา=0 → 6, จ=1 → 0
        startOfWeek.setDate(localDate.getDate() - dowMon0);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const startOfMonth = new Date(localDate.getFullYear(), localDate.getMonth(), 1);
        const endOfMonth = new Date(localDate.getFullYear(), localDate.getMonth() + 1, 0, 23, 59, 59, 999);

        // ===== main aggregates (scoped by owner) =====
        const [dailyRaw, weeklyData, monthlyData] = await Promise.all([
            aggregateSales(startOfDay, endOfDay, "hour", ownerObjectId),
            aggregateSales(startOfWeek, endOfWeek, "day", ownerObjectId),
            aggregateSales(startOfMonth, endOfMonth, "day", ownerObjectId),
        ]);

        const dailyData = fillHours(dailyRaw, startOfDay);

        const summary = {
            daily: makeSummary(dailyData),
            weekly: makeSummary(weeklyData),
            monthly: makeSummary(monthlyData),
        };

        const topProducts = {
            daily: getTopProducts(dailyRaw),
            weekly: getTopProducts(weeklyData),
            monthly: getTopProducts(monthlyData),
        };

        if (topProducts.daily.length > 0) {
            const top = topProducts.daily[0];
            dailyData.forEach((d) => {
                d.bestSeller = {
                    name: top.name,
                    barcode: top.barcode,
                    quantity: top.quantity,
                    revenue: top.revenue,
                };
            });
        }

        const byEmployee = {
            daily: await aggregateByEmployee(startOfDay, endOfDay, ownerObjectId),
            weekly: await aggregateByEmployee(startOfWeek, endOfWeek, ownerObjectId),
            monthly: await aggregateByEmployee(startOfMonth, endOfMonth, ownerObjectId),
        };

        // previous ranges
        const prevDayStart = new Date(startOfDay); prevDayStart.setDate(prevDayStart.getDate() - 1);
        const prevWeekStart = new Date(startOfWeek); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevMonthStart = new Date(startOfMonth); prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

        const prevDayData = makeSummary(await aggregateSales(prevDayStart, startOfDay, "hour", ownerObjectId));
        const prevWeekData = makeSummary(await aggregateSales(prevWeekStart, startOfWeek, "day", ownerObjectId));
        const prevMonthData = makeSummary(await aggregateSales(prevMonthStart, startOfMonth, "day", ownerObjectId));

        const changes = {
            daily: calcChange(summary.daily, prevDayData),
            weekly: calcChange(summary.weekly, prevWeekData),
            monthly: calcChange(summary.monthly, prevMonthData),
        };

        res.status(200).json({
            success: true,
            data: {
                daily: dailyData,
                weekly: weeklyData,
                monthly: monthlyData,
                summary,
                topProducts,
                byEmployee,
                changes: changes || { daily: {}, weekly: {}, monthly: {} },
            },
        });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูล Dashboard" });
    }
};

// ======================= Aggregate Sales (ตามบิลสุทธิ-ต้นทุน) =======================
export async function aggregateSales(
    start: Date,
    end: Date,
    groupBy: "hour" | "day",
    ownerObjectId: mongoose.Types.ObjectId
) {
    // ดึงราคาทุนเฉพาะของ owner
    const stocks = await Stock.find({ userId: ownerObjectId }).lean();
    const stockMap = new Map(
        stocks.map((s) => [
            s.barcode,
            { costPrice: Number(s.costPrice || 0), salePrice: Number(s.salePrice || 0) },
        ])
    );

    // ใบเสร็จเฉพาะของ owner
    const receipts = await Receipt.find({
        userId: ownerObjectId,
        timestamp: { $gte: start, $lte: end },
    }).lean();

    type BucketKey = { hour: number } | { year: number; month: number; day: number };

    const buckets = new Map<
        string,
        {
            key: BucketKey;
            totalSales: number;
            netSales: number;
            totalQuantity: number;
            totalProfit: number;
            products: Map<string, { name: string; barcode: string; quantity: number; revenue: number }>;
        }
    >();

    const makeKey = (d: Date): { key: BucketKey; str: string } => {
        if (groupBy === "hour") {
            const hour = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })).getHours();
            return { key: { hour }, str: `h:${hour}` };
        } else {
            const loc = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
            return {
                key: { year: loc.getFullYear(), month: loc.getMonth() + 1, day: loc.getDate() },
                str: `d:${loc.getFullYear()}-${loc.getMonth() + 1}-${loc.getDate()}`,
            };
        }
    };

    for (const r of receipts) {
        const { key, str } = makeKey(r.timestamp as Date);
        if (!buckets.has(str)) {
            buckets.set(str, {
                key,
                totalSales: 0,
                netSales: 0,
                totalQuantity: 0,
                totalProfit: 0,
                products: new Map(),
            });
        }
        const b = buckets.get(str)!;

        const sign = r.isReturn ? -1 : 1;

        let billSubtotal = 0;
        let billQty = 0;
        let billCost = 0;

        for (const it of r.items || []) {
            const qty = Number(it.quantity || 0);
            const subtotal = Number(it.subtotal || 0);
            billSubtotal += subtotal;
            billQty += qty;

            const itemCost =
                it.costPrice != null
                    ? Number(it.costPrice)
                    : Number(stockMap.get(it.barcode)?.costPrice || 0);
            billCost += itemCost * qty;

            const pKey = it.barcode || it.name;
            if (!b.products.has(pKey)) {
                b.products.set(pKey, {
                    name: it.name,
                    barcode: it.barcode || "-",
                    quantity: 0,
                    revenue: 0,
                });
            }
            const p = b.products.get(pKey)!;
            p.quantity += qty * sign;
            p.revenue += subtotal * sign;
        }

        const billNet = Number(r.totalPrice || 0);
        const billProfit = (billNet - billCost) * sign;

        b.totalSales += billSubtotal * sign;
        b.netSales += billNet * sign;
        b.totalQuantity += billQty * sign;
        b.totalProfit += billProfit;
    }

    const output = Array.from(buckets.values())
        .sort((a, b) => (JSON.stringify(a.key) < JSON.stringify(b.key) ? -1 : 1))
        .map((b) => {
            let date: Date;
            if ("hour" in b.key) {
                date = new Date(start);
                date.setHours(b.key.hour, 0, 0, 0);
            } else {
                const { year, month, day } = b.key;
                date = new Date(year, month - 1, day);
            }

            const prodArr = Array.from(b.products.values());
            const bestSeller =
                prodArr.length > 0
                    ? prodArr.reduce((best, p) => (p.quantity > best.quantity ? p : best), prodArr[0])
                    : { name: "-", quantity: 0, revenue: 0, barcode: "" };

            return {
                totalSales: b.totalSales,
                totalQuantity: b.totalQuantity,
                netSales: b.netSales,
                totalProfit: b.totalProfit,
                bestSeller,
                products: prodArr,
                formattedDate: formatThaiDate(date),
                hour: "hour" in b.key ? b.key.hour : null,
            };
        });

    return output;
}

// ======================= Summary รวม =======================
function makeSummary(data: any[]) {
    const totalSales = data.reduce((s, d) => s + Number(d.totalSales || 0), 0);
    const netSales = data.reduce((s, d) => s + Number(d.netSales || 0), 0);
    const totalQuantity = data.reduce((s, d) => s + Number(d.totalQuantity || 0), 0);
    const totalProfit = data.reduce((s, d) => s + Number(d.totalProfit || 0), 0);
    return { totalSales, netSales, totalQuantity, totalProfit };
}

function calcChange(current: any, previous: any) {
    const getPercent = (cur: number, prev: number) => (prev === 0 ? 0 : ((cur - prev) / prev) * 100);
    return {
        totalSalesChange: getPercent(current.totalSales, previous.totalSales),
        totalProfitChange: getPercent(current.totalProfit, previous.totalProfit),
        totalQuantityChange: getPercent(current.totalQuantity, previous.totalQuantity),
    };
}

// ======================= Top Products =======================
function getTopProducts(data: any[]) {
    const productMap: Record<string, any> = {};
    data.forEach((bucket) => {
        if (!Array.isArray(bucket.products)) return;
        bucket.products.forEach((product: any) => {
            const key = product.barcode || product.name;
            if (!productMap[key]) {
                productMap[key] = {
                    name: product.name,
                    barcode: product.barcode || "-",
                    quantity: product.quantity,
                    revenue: product.revenue,
                };
            } else {
                productMap[key].quantity += product.quantity;
                productMap[key].revenue += product.revenue;
            }
        });
    });
    const mergedProducts = Object.values(productMap)
        .sort((a: any, b: any) => b.quantity - a.quantity)
        .slice(0, 5);
    return mergedProducts.length > 0 ? mergedProducts : [{ name: "-", quantity: 0, revenue: 0 }];
}

// ======================= By Employee =======================
async function aggregateByEmployee(start: Date, end: Date, ownerObjectId: mongoose.Types.ObjectId) {
    const receipts = await Receipt.aggregate([
        { $match: { userId: ownerObjectId, timestamp: { $gte: start, $lte: end } } }, // ✅ scope by owner
        {
            $group: {
                _id: "$employeeName",
                totalSales: { $sum: "$totalPrice" },
                count: { $sum: 1 },
            },
        },
        { $sort: { totalSales: -1 } },
    ]);

    return receipts.map((r) => ({
        employee: r._id,
        totalSales: r.totalSales,
        count: r.count,
    }));
}