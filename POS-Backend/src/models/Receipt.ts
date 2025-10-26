import mongoose, { Schema, Document } from "mongoose";

export interface IReceiptItem {
    barcode: string;
    name: string;
    price: number;
    costPrice?: number;
    cost?: number;
    quantity: number;
    subtotal: number;
    discount?: number; // ✅ ส่วนลดต่อสินค้า (ถ้ามี)
    profit?: number;
}

export interface IReceipt extends Document {
    userId?: mongoose.Types.ObjectId;
    paymentId?: mongoose.Types.ObjectId | null;
    originalReceiptId?: mongoose.Types.ObjectId | null; // ใบเสร็จต้นทาง (กรณีคืนสินค้า)
    returnReceiptId?: mongoose.Types.ObjectId | null;   // ใบเสร็จคืน (กรณีถูกคืน)
    employeeName: string;
    items: IReceiptItem[];
    totalPrice: number; // ✅ ยอดรวมหลังหักส่วนลด
    discount: number; // ✅ ส่วนลดรวมของใบเสร็จ (บาท)
    paymentMethod: "เงินสด" | "โอนเงิน" | "บัตรเครดิต" | "QR Code";
    amountPaid: number;
    changeAmount: number;
    isReturn?: boolean; // เป็นใบเสร็จคืนสินค้าหรือไม่
    returnReason?: string;
    profit?: number;
    timestamp: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

const ReceiptItemSchema = new Schema<IReceiptItem>(
    {
        barcode: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        subtotal: { type: Number, required: true },
        discount: { type: Number, default: 0 }, // ✅ ส่วนลดต่อสินค้า
        profit: { type: Number, default: 0 },
    },
    { _id: false }
);

const ReceiptSchema = new Schema<IReceipt>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
        originalReceiptId: { type: Schema.Types.ObjectId, ref: "Receipt", default: null },
        returnReceiptId: { type: Schema.Types.ObjectId, ref: "Receipt", default: null },

        employeeName: { type: String, required: true },

        items: {
            type: [ReceiptItemSchema],
            required: true,
            validate: {
                validator: (items: IReceiptItem[]) => items.length > 0,
                message: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ",
            },
        },

        totalPrice: { type: Number, required: true },
        discount: { type: Number, default: 0 }, // ✅ ส่วนลดรวมของใบเสร็จ
        paymentMethod: {
            type: String,
            enum: ["เงินสด", "โอนเงิน", "บัตรเครดิต", "QR Code"],
            required: true,
        },
        amountPaid: { type: Number, required: true },
        changeAmount: { type: Number, required: true },

        isReturn: { type: Boolean, default: false },
        returnReason: { type: String, default: null },

        profit: { type: Number, default: 0 },
        timestamp: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// ✅ Index เพื่อ query เร็วขึ้น
ReceiptSchema.index({ timestamp: -1 });
ReceiptSchema.index({ employeeName: 1 });
ReceiptSchema.index({ isReturn: 1 });
ReceiptSchema.index({ originalReceiptId: 1 });
ReceiptSchema.index({ returnReceiptId: 1 });
ReceiptSchema.index({ discount: 1 }); // ✅ เพื่อรายงานยอดส่วนลด

const Receipt = mongoose.model<IReceipt>("Receipt", ReceiptSchema);
export default Receipt;