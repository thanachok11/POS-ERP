// controllers/paymentController.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import Receipt from "../models/Receipt";
import Stock from "../models/Stock";
import StockTransaction from "../models/StockTransaction";
import Payment from "../models/Payment";
import User from "../models/User";
import Employee from "../models/Employee";
import { verifyToken } from "../utils/auth";

/* ======================= Helper: resolve ownerId ======================= */
const getOwnerId = async (userId: string): Promise<string> => {
    let user: any = await User.findById(userId);
    if (!user) user = await Employee.findById(userId);
    if (!user) throw new Error("User not found");

    if (user.role === "admin") return user._id.toString();
    if (user.role === "employee") {
        if (!user.adminId) throw new Error("Employee does not have admin assigned");
        return user.adminId.toString();
    }
    throw new Error("Invalid user role");
};

/* ============================================================
   🧾 สร้างการชำระเงิน (ทั้งขายและคืนสินค้า)
============================================================ */
export const createPayment = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" }); return;
        }

        const ownerId = await getOwnerId(decoded.userId);

        const {
            saleId,
            employeeName,          // <- อาจว่างมาจาก client
            paymentMethod,
            amountReceived,
            items,
            discount = 0,
        } = req.body;

        // ✅ หา “ชื่อพนักงาน” ให้แน่ ๆ
        const actor =
            (await User.findById(decoded.userId).lean()) ||
            (await Employee.findById(decoded.userId).lean());

        const tokenName =
            (decoded as any).username ||
                (decoded as any).name ||
                (decoded as any).firstname && (decoded as any).lastname
                ? `${(decoded as any).firstname} ${(decoded as any).lastname}`
                : "";

        const empName =
            employeeName ||
            tokenName ||
            (actor && ("username" in actor) ? (actor as any).username : "") ||
            (actor && ("firstName" in actor || "lastName" in actor)
                ? [(actor as any).firstName, (actor as any).lastName].filter(Boolean).join(" ")
                : "") ||
            (actor as any)?.email ||
            "Employee";

        // ❗️ผ่อนเงื่อนไข: ไม่ต้องเช็ค employeeName แล้ว เพราะเรามี empName เสมอ
        if (!saleId || !paymentMethod || !amountReceived || !items?.length) {
            res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
            return;
        }

        // 💰 ดึงข้อมูลสินค้าและคำนวณกำไร (อิงสต็อกของ owner เท่านั้น)
        const calculatedItems = await Promise.all(
            items.map(async (item: any) => {
                const stock = await Stock.findOne({ barcode: item.barcode, userId: ownerId });
                const costPrice = stock?.costPrice || 0;
                const profit = (Number(item.price) - Number(costPrice)) * Number(item.quantity || 0);
                return { ...item, profit };
            })
        );

        // ✅ คำนวณยอดรวมก่อนหักส่วนลด
        const subtotal = calculatedItems.reduce((sum, i) => sum + Number(i.subtotal || 0), 0);

        // ✅ ยอดรวมหลังหักส่วนลด
        const totalPrice = Math.max(subtotal - Number(discount || 0), 0);

        // ✅ กำไรรวม
        const totalProfit = calculatedItems.reduce((sum, i) => sum + Number(i.profit || 0), 0);

        // 💵 เงินทอนเฉพาะเงินสด
        const changeAmount =
            paymentMethod === "เงินสด" && amountReceived ? Number(amountReceived) - totalPrice : 0;

        // ✅ 1) Payment
        const [newPayment] = await Payment.create(
            [
                {
                    userId: ownerId,          // <-- บันทึกว่าเป็นของ owner
                    saleId,
                    employeeName: empName,
                    paymentMethod,
                    type: "SALE",
                    amountReceived,
                    amount: totalPrice,       // หลังหักส่วนลด
                    discount,
                    profit: totalProfit,
                    status: "สำเร็จ",
                },
            ],
            { session }
        );

        // ✅ 2) Receipt
        const [newReceipt] = await Receipt.create(
            [
                {
                    userId: ownerId,          // <-- ของ owner
                    paymentId: newPayment._id,
                    employeeName: empName,
                    items: calculatedItems,
                    totalPrice,
                    discount,
                    paymentMethod,
                    amountPaid: amountReceived,
                    changeAmount,
                    profit: totalProfit,
                    timestamp: new Date(),
                },
            ],
            { session }
        );

        // ✅ 3) เชื่อม Payment → Receipt
        await Payment.updateOne(
            { _id: newPayment._id },
            { $set: { receiptId: newReceipt._id } },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            message: "✅ บันทึกการขายและใบเสร็จสำเร็จ",
            payment: newPayment,
            receipt: newReceipt,
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("❌ Error in createPayment:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการบันทึก", error });
    }
};

/* ============================================================
   💳 ดึงข้อมูลการชำระเงินทั้งหมด
   - อิง ownerId เพื่อรวมยอดทั้งร้าน (แม้ล็อกอินเป็น employee)
============================================================ */
export const getAllPayments = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) {
            res.status(401).json({ success: false, message: "Unauthorized" });
            return;
        }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" });
            return;
        }

        const ownerId = await getOwnerId(decoded.userId);

        const payments = await Payment.find({ userId: ownerId })
            .populate("receiptId")
            .sort({ createdAt: -1 });

        // ✅ ส่งกลับ 200 + [] ดีกว่า 404 เพื่อลด error ฝั่ง UI
        res.status(200).json({ success: true, data: payments || [] });
    } catch (error) {
        console.error("Error retrieving payments:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลการชำระเงิน", error });
    }
};

/* ============================================================
   🔁 คืนสินค้า (ทั้งใบหรือบางรายการ)
   - Scope ด้วย ownerId ทั้งตอนอ่าน/อัปเดต
============================================================ */
export const processRefund = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const token = req.header("Authorization")?.split(" ")[1];
        if (!token) {
            res.status(401).json({ success: false, message: "Unauthorized" });
            return;
        }

        const decoded = verifyToken(token);
        if (typeof decoded === "string" || !("userId" in decoded)) {
            res.status(401).json({ success: false, message: "Invalid token" });
            return;
        }
        const ownerId = await getOwnerId(decoded.userId);

        const { saleId, reason, paymentMethod, items } = req.body;
        if (!saleId) {
            res.status(400).json({ success: false, message: "กรุณาระบุรหัสการขายหรือรหัสใบเสร็จ" });
            return;
        }
        if (!paymentMethod) {
            res.status(400).json({ success: false, message: "กรุณาระบุวิธีคืนเงิน" });
            return;
        }

        // ✅ ดึงใบเสร็จต้นฉบับ (เฉพาะของ owner)
        const isObjectId = mongoose.Types.ObjectId.isValid(saleId);
        const receipt = isObjectId
            ? await Receipt.findOne({ _id: saleId, userId: ownerId }).session(session)
            : await Receipt.findOne({ saleId, userId: ownerId }).session(session);

        if (!receipt) {
            res.status(404).json({ success: false, message: "ไม่พบใบเสร็จนี้" });
            return;
        }

        // 🚫 ป้องกันคืนซ้ำ
        if (receipt.isReturn || receipt.returnReceiptId) {
            res.status(400).json({
                success: false,
                message: "⚠️ ใบเสร็จนี้ได้ทำรายการคืนสินค้าไปแล้ว ไม่สามารถคืนซ้ำได้",
            });
            return;
        }

        const payment = await Payment.findOne({ _id: receipt.paymentId, userId: ownerId }).session(session);
        if (!payment) {
            res.status(404).json({ success: false, message: "ไม่พบข้อมูลการชำระเงินต้นทาง" });
            return;
        }

        // ✅ ใช้เฉพาะสินค้าที่เลือกมาคืน
        const refundItems = items && items.length > 0 ? items : receipt.items;

        // 💰 คำนวณยอดคืน/กำไรจากรายการที่เลือก
        const refundAmount = refundItems.reduce((sum: number, i: any) => sum + Math.abs(Number(i.subtotal || 0)), 0);
        const refundProfit = refundItems.reduce((sum: number, i: any) => sum + Math.abs(Number(i.profit || 0)), 0);

        // 📦 คืนสินค้าเข้าสต็อก (ของ owner เท่านั้น)
        for (const item of refundItems) {
            const stock = await Stock.findOne({ barcode: item.barcode, userId: ownerId }).session(session);
            if (stock) {
                stock.totalQuantity = Number(stock.totalQuantity || 0) + Number(item.quantity || 0);
                await stock.save({ session });
                await stock.updateStatus();

                await StockTransaction.create(
                    [
                        {
                            stockId: stock._id,
                            productId: stock.productId,
                            userId: ownerId,            // ผูกกับ owner
                            type: "RETURN",
                            quantity: Number(item.quantity || 0),
                            costPrice: stock.costPrice,
                            salePrice: Number(item.price || 0),
                            source: "CUSTOMER",
                            notes: `คืนสินค้า ${reason || "ไม่ระบุเหตุผล"}`,
                            referenceId: receipt._id,
                        },
                    ],
                    { session }
                );
            }
        }

        // 💳 Payment: REFUND (ของ owner)
        const [refundPayment] = await Payment.create(
            [
                {
                    userId: ownerId,
                    saleId: payment.saleId,
                    employeeName: receipt.employeeName,
                    paymentMethod,
                    type: "REFUND",
                    amountReceived: refundAmount,
                    amount: -refundAmount,
                    profit: -refundProfit,
                    status: "สำเร็จ",
                    notes: reason || "คืนสินค้าบางรายการ",
                },
            ],
            { session }
        );

        // 🧾 Receipt คืนสินค้าใหม่ (ของ owner)
        const [returnReceipt] = await Receipt.create(
            [
                {
                    userId: ownerId,
                    paymentId: refundPayment._id,
                    originalReceiptId: receipt._id,
                    employeeName: receipt.employeeName,
                    items: refundItems.map((i: any) => ({
                        ...i,
                        subtotal: -Math.abs(Number(i.subtotal || 0)),
                        profit: -Number(i.profit || 0),
                    })),
                    totalPrice: -refundAmount,
                    paymentMethod,
                    amountPaid: refundAmount,
                    changeAmount: 0,
                    isReturn: true,
                    returnReason: reason,
                    timestamp: new Date(),
                    profit: -refundProfit,
                },
            ],
            { session }
        );

        // 🔗 เชื่อม Payment ↔ Receipt
        refundPayment.receiptId = returnReceipt._id as any;
        await refundPayment.save({ session });

        // 🔗 Mark ใบเสร็จต้นฉบับว่ามีใบคืน (ไม่ต้อง flag isReturn เป็น true เพื่อกันซ้ำครั้งถัดไป)
        await Receipt.updateOne(
            { _id: receipt._id, userId: ownerId },
            { $set: { returnReceiptId: returnReceipt._id } },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: "✅ คืนสินค้าสำเร็จ (บางรายการหรือทั้งใบ)",
            data: {
                originalReceipt: receipt,
                returnReceipt,
                refundPayment,
            },
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("❌ processRefund Error:", error);
        res.status(500).json({ success: false, message: "Server error", error });
    }
};