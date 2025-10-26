import mongoose, { Schema, Document } from "mongoose";

export interface IPayment extends Document {
    userId: mongoose.Types.ObjectId;
    saleId: string; // รหัสคำสั่งซื้อ / POS session
    receiptId?: mongoose.Types.ObjectId | null | any;
    employeeName: string; // พนักงานที่รับเงิน/คืนเงิน
    paymentMethod: "เงินสด" | "โอนเงิน" | "บัตรเครดิต" | "QR Code";
    type: "SALE" | "REFUND"; // ประเภทการชำระเงิน
    amountReceived: number; // จำนวนเงินที่ลูกค้าจ่ายมา
    amount: number; // ยอดเงินจริง (refund จะเป็นค่าลบ)
    discount: number; // ✅ ส่วนลดทั้งหมดของธุรกรรม (บาท)
    profit: number; // กำไรของธุรกรรมนี้ (refund จะเป็นค่าลบ)
    status: "รอดำเนินการ" | "สำเร็จ" | "ล้มเหลว";
    notes?: string; // เก็บเหตุผล เช่น "คืนสินค้า"
    createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        saleId: { type: String, required: true },
        receiptId: { type: Schema.Types.ObjectId, ref: "Receipt" },
        employeeName: { type: String, required: true },
        paymentMethod: {
            type: String,
            enum: ["เงินสด", "โอนเงิน", "บัตรเครดิต", "QR Code"],
            required: true,
        },
        type: {
            type: String,
            enum: ["SALE", "REFUND"],
            default: "SALE",
        },
        amountReceived: { type: Number, required: true },
        amount: { type: Number, required: true },
        discount: { type: Number, default: 0 }, // ✅ เพิ่มส่วนลด
        profit: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ["รอดำเนินการ", "สำเร็จ", "ล้มเหลว"],
            default: "รอดำเนินการ",
        },
        notes: { type: String },
        createdAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// ✅ Index เพื่อ query ได้ไวขึ้น
PaymentSchema.index({ type: 1 });
PaymentSchema.index({ receiptId: 1 });
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ profit: 1 });
PaymentSchema.index({ discount: 1 }); // ✅ สำหรับรายงานส่วนลด

const Payment = mongoose.model<IPayment>("Payment", PaymentSchema);
export default Payment;