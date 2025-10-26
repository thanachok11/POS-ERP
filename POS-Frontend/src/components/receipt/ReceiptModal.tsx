import React from "react";
import "../../styles/receipt/ReceiptDetail.css";
import { Receipt } from "../../types/receipt";

interface ReceiptModalProps {
    receipt: Receipt;
    onClose: () => void;
}

const formatThaiDateTime = (dateString: string) =>
    new Date(dateString)
        .toLocaleString("th-TH", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Bangkok",
        })
        .replace("น.", "")
        .trim() + " น.";

const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
    const handlePrint = () => window.print();

    const payment =
        typeof receipt.paymentId === "object" && receipt.paymentId !== null
            ? receipt.paymentId
            : null;

    const isReturn = receipt.isReturn;
    const discount = receipt.discount ?? 0;

    // ✅ ยอดรวมก่อนส่วนลด
    const beforeDiscount = Math.abs(receipt.totalPrice) + discount;

    // ✅ ยอดหลังหักส่วนลด (รวม VAT)
    const afterDiscount = Math.abs(receipt.totalPrice);

    // ✅ ยอดก่อนภาษี (แยก VAT ออกจากยอดสุทธิ)
    const netBeforeVat = afterDiscount / 1.07;

    // ✅ ภาษีมูลค่าเพิ่ม 7%
    const vat = afterDiscount - netBeforeVat;

    return (
        <div className="receipt-modal-overlay">
            <div className="receipt-modal-content">
                <div
                    className={`receipt-modal-paper receipt-print-area ${isReturn ? "return" : "sale"
                        }`}
                >
                    {/* 🏪 Header */}
                    <div className="receipt-modal-header">
                        <h3 className={`receipt-type-title ${isReturn ? "return" : "sale"}`}>
                            {isReturn ? "ใบเสร็จคืนสินค้า" : "ใบเสร็จการขาย"}
                        </h3>
                        <h2 className="receipt-store-name">EazyPOS Store</h2>
                        <p className="receipt-store-branch">สาขา ศรีเจริญ</p>
                        <p className="receipt-store-contact">โทร. 063-313-3099</p>
                        <hr className="receipt-separator" />
                    </div>

                    {/* 📜 ข้อมูลใบเสร็จ */}
                    <div className="receipt-info-inline">
                        {payment?.saleId && <p>รหัสการขาย: {payment.saleId}</p>}
                        <p>
                            วันที่:{" "}
                            {formatThaiDateTime(payment?.createdAt ?? receipt.timestamp)}
                        </p>
                        <p>พนักงาน: {receipt.employeeName ?? "Employee"}</p>
                        <p>
                            วิธีชำระ: {payment?.paymentMethod ?? receipt.paymentMethod}
                        </p>
                        {isReturn && receipt.returnReason && (
                            <p>เหตุผล: {receipt.returnReason}</p>
                        )}
                    </div>

                    <hr className="receipt-separator" />

                    {/* 🛒 รายการสินค้า */}
                    <div className="receipt-items-list">
                        {receipt.items.map((item, index) => (
                            <div
                                key={item._id || item.barcode || index}
                                className="receipt-item-row"
                            >
                                <span className="receipt-item-name">
                                    {item.name} x {item.quantity}
                                </span>
                                <span className="receipt-item-total">
                                    {item.subtotal.toLocaleString()} ฿
                                </span>
                            </div>
                        ))}
                    </div>

                    <hr className="receipt-separator" />

                    {/* 💰 สรุปยอด */}
                    <div className="receipt-summary">
                        <p>
                            <span>ยอดรวมก่อนส่วนลด</span>
                            <strong>{beforeDiscount.toLocaleString()} ฿</strong>
                        </p>
                        {discount > 0 && (
                            <p>
                                <span>ส่วนลด</span>
                                <strong>-{discount.toLocaleString()} ฿</strong>
                            </p>
                        )}
                        <p>
                            <span>ยอดหลังหักส่วนลด (รวม VAT)</span>
                            <strong>{afterDiscount.toLocaleString()} ฿</strong>
                        </p>
                        <p>
                            <span>ยอดก่อนภาษี</span>
                            <strong>
                                {netBeforeVat.toLocaleString(undefined, {
                                    maximumFractionDigits: 2,
                                })} ฿
                            </strong>
                        </p>
                        <p>
                            <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span>
                            <strong>
                                {vat.toLocaleString(undefined, {
                                    maximumFractionDigits: 2,
                                })} ฿
                            </strong>
                        </p>
                        <p className={`receipt-total ${isReturn ? "negative" : ""}`}>
                            <span>ยอดสุทธิ</span>
                            <strong>
                                {isReturn ? "-" : ""}
                                {afterDiscount.toLocaleString(undefined, {
                                    maximumFractionDigits: 2,
                                })} ฿
                            </strong>
                        </p>

                        <hr />
                        <p>
                            <span>จำนวนเงินที่จ่าย</span>
                            <strong>{receipt.amountPaid.toLocaleString()} ฿</strong>
                        </p>
                        <p>
                            <span>เงินทอน</span>
                            <strong>{receipt.changeAmount.toLocaleString()} ฿</strong>
                        </p>
                    </div>

                    {/* 🙏 Footer */}
                    <div className="receipt-footer">
                        <p>{isReturn ? "🔁 คืนสินค้าเรียบร้อย" : "🙏 ขอบคุณที่ใช้บริการ 🙏"}</p>
                        <p style={{ fontSize: "11px", marginTop: "5px" }}>
                            (เอกสารนี้ออกโดยระบบ EazyPOS)
                        </p>
                    </div>
                </div>

                {/* 🔘 ปุ่ม */}
                <div className="receipt-modal-actions">
                    <button className="receipt-btn-print" onClick={handlePrint}>
                        🖨️ พิมพ์ใบเสร็จ
                    </button>
                    <button className="receipt-btn-close" onClick={onClose}>
                        ✖ ปิด
                    </button>
                </div>
            </div>
        </div>
    );
};


export default ReceiptModal;
