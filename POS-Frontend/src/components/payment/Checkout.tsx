import React, { useState, useEffect } from "react";
import "../../styles/payment/Checkout.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faMoneyBill,
  faQrcode,
  faCreditCard,
} from "@fortawesome/free-solid-svg-icons";
import { QRCodeSVG } from "qrcode.react";
import generatePayload from "promptpay-qr";

// ✅ เพิ่ม API ดึงส่วนลด
import { getDiscounts } from "../../api/payment/discountApi";

interface Discount {
  _id: string;
  code: string;
  type: "percent" | "baht";
  value: number;
  description: string;
  isActive: boolean;
}

interface CheckoutProps {
  cart: { barcode: string; name: string; price: number; totalQuantity: number }[];
  totalPrice: number;
  onClose: () => void;
  onConfirmPayment: (method: string, amountReceived?: number) => void;
  checkout: (
    amountReceived: number,
    selectedPaymentMethod: "เงินสด" | "โอนเงิน" | "บัตรเครดิต" | "QR Code",
    discountAmount?: number // ✅ เพิ่มฟิลด์ส่วนลด
  ) => Promise<void>;
}


const Checkout: React.FC<CheckoutProps> = ({
  cart,
  totalPrice,
  onClose,
  onConfirmPayment,
  checkout,
}) => {
  // ==================== 💰 State เดิม ====================
  const [showNumpad, setShowNumpad] = useState(false);
  const [cashInput, setCashInput] = useState("");
  const [change, setChange] = useState<number | null>(null);
  const [showCredit, setShowCredit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [phoneNumber] = useState("0633133099");

  // ==================== 🎟 ส่วนลด ====================
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [loading, setLoading] = useState(false);
    const [popup, setPopup] = useState({
        show: false,
        message: "",
        isSuccess: true,
    });
  const token = localStorage.getItem("token");

  // ✅ โหลดส่วนลดทั้งหมด
  useEffect(() => {
       // ✅ โหลดข้อมูลส่วนลด
       const fetchDiscounts = async () => {
           try {
               setLoading(true);
               if (!token) throw new Error("Token not found");
               const response = await getDiscounts(token);
               const discountsData = Array.isArray(response)
                   ? response
                   : Array.isArray(response.data)
                       ? response.data
                       : [];
               setDiscounts(discountsData);
           } catch (err) {
               console.error("โหลดข้อมูลส่วนลดล้มเหลว:", err);
               setPopup({
                   show: true,
                   message: "❌ โหลดข้อมูลส่วนลดไม่สำเร็จ",
                   isSuccess: false,
               });
           } finally {
               setLoading(false);
           }
       };
    fetchDiscounts();
  }, []);

  // ✅ คำนวณ QR code ใหม่
  useEffect(() => {
    const qr = generatePayload(phoneNumber, { amount: totalPrice });
    setQrCode(qr);
  }, [totalPrice, phoneNumber]);

  // ✅ คำนวณยอดส่วนลด
  useEffect(() => {
    if (!selectedDiscount) {
      setDiscountAmount(0);
      return;
    }

    let discount = 0;
    if (selectedDiscount.type === "percent") {
      discount = (totalPrice * selectedDiscount.value) / 100;
    } else if (selectedDiscount.type === "baht") {
      discount = selectedDiscount.value;
    }
    setDiscountAmount(discount);
  }, [selectedDiscount, totalPrice]);

  // ✅ ยอดสุทธิหลังส่วนลด
  const finalTotal = Math.max(totalPrice - discountAmount, 0);

  // ✅ เงินสด
  const handleCashPayment = () => {
    const cashAmount = parseFloat(cashInput);
    setChange(isNaN(cashAmount) ? null : cashAmount - finalTotal);
  };

  const confirmCashPayment = async () => {
    const cashAmount = parseFloat(cashInput);
    if (change !== null && change >= 0) {
      await checkout(cashAmount, "เงินสด", discountAmount); // ✅ ส่งส่วนลด
      onClose();
    }
  };

  const confirmQRPayment = async () => {
    await checkout(finalTotal, "QR Code", discountAmount); // ✅ ส่งส่วนลด
    onClose();
  };

  const confirmCreditPayment = async () => {
    if (selectedCard) {
      await checkout(finalTotal, "บัตรเครดิต", discountAmount); // ✅ ส่งส่วนลด
      onClose();
    }
  };
  return (
    <div className="checkout-display">
      <div className="checkout-modal">
        <div className="checkout-content">
          {/* 🧾 ด้านซ้าย: รายการสินค้า */}
          <div className="checkout-left">
            <div className="checkout-items">
              {cart.map((item) => (
                <div key={item.barcode} className="checkout-item">
                  <span className="checkout-item-name">{item.name}</span>
                  <span className="checkout-item-price">
                    ราคา {item.price.toLocaleString()} บาท
                  </span>
                  <span className="checkout-item-quantity">
                    x {item.totalQuantity} รายการ
                  </span>
                </div>
              ))}
            </div>

            <div className="checkout-total">
              <p>ยอดรวมสินค้า: {totalPrice.toLocaleString()} ฿</p>
              {selectedDiscount && (
                <p className="checkout-discount-amount">
                  ส่วนลด: -{discountAmount.toLocaleString()} ฿
                </p>
              )}
              <p className="checkout-final">
                <strong>ยอดสุทธิ: {finalTotal.toLocaleString()} ฿</strong>
              </p>
            </div>
            {/* ข้อความแจ้งเงินทอน */}

            {/* 🎟 ส่วนลด */}
            <div className="checkout-discount">
              <label htmlFor="discount-select">เลือกส่วนลด:</label>
              <select
                id="discount-select"
                onChange={(e) => {
                  const selected = discounts.find(
                    (d) => d._id === e.target.value
                  );
                  setSelectedDiscount(selected || null);
                }}
                value={selectedDiscount?._id || ""}
              >
                <option value="">-- ไม่มีส่วนลด --</option>
                {discounts.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.code} ({d.type === "percent" ? `${d.value}%` : `${d.value}฿`})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 💳 ด้านขวา: ปุ่มเลือกวิธีชำระเงิน */}
          <div className="checkout-right">
            <button onClick={onClose} className="checkout-close-btn">
              <FontAwesomeIcon icon={faTimes} />
            </button>

            <div className="checkout-payment-buttons">
              <button
                className="checkout-cash-btn"
                onClick={() => {
                  setShowNumpad(true);
                  setShowQR(false);
                  setShowCredit(false);
                }}
              >
                <FontAwesomeIcon icon={faMoneyBill} /> เงินสด
              </button>

              <button
                className="checkout-qr-btn"
                onClick={() => {
                  setShowQR(true);
                  setShowNumpad(false);
                  setShowCredit(false);
                }}
              >
                <FontAwesomeIcon icon={faQrcode} /> QR Code
              </button>

              <button
                className="checkout-credit-btn"
                onClick={() => {
                  setShowCredit(true);
                  setShowNumpad(false);
                  setShowQR(false);
                }}
              >
                <FontAwesomeIcon icon={faCreditCard} /> บัตรเครดิต
              </button>
            </div>

            {/* 🧮 Number Pad สำหรับเงินสด */}
            {showNumpad && (
              <div className="checkout-numpad-overlay" onClick={() => setShowNumpad(false)}>
                <div
                  className="checkout-numpad-popup"
                  onClick={(e) => e.stopPropagation()} // ป้องกันปิดเมื่อคลิกใน popup
                >
                  <button
                    className="checkout-numpad-close"
                    onClick={() => setShowNumpad(false)}
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>

                  <h3 className="checkout-numpad-title">กรุณาใส่จำนวนเงิน</h3>

                  {/* ช่องแสดงจำนวนเงิน */}
                  <input
                    type="text"
                    className="checkout-numpad-input"
                    value={
                      cashInput
                        ? Number(cashInput).toLocaleString()
                        : ""
                    }
                    readOnly
                  />

                  {/* ✅ แสดงสถานะเงิน */}
                  {change !== null && (
                    <p
                      className={
                        change >= 0 ? "checkout-change" : "checkout-error"
                      }
                    >
                      {change >= 0
                        ? `✅ จำนวนเงินถูกต้อง — เงินทอน ${change.toLocaleString()} ฿`
                        : "❌ จำนวนเงินไม่เพียงพอ"}
                    </p>
                  )}

                  {/* ปุ่มตัวเลข */}
                  <div className="numpad-buttons">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                      <button
                        key={num}
                        className="numpad-btn"
                        onClick={() => {
                          setCashInput(cashInput + num);
                          setError(null);
                        }}
                      >
                        {num}
                      </button>
                    ))}

                    <button
                      className="numpad-btn backspace-btn"
                      onClick={() => {
                        setCashInput(cashInput.slice(0, -1));
                        setChange(null);
                        setError(null);
                      }}
                    >
                      ⬅
                    </button>

                    <button
                      className="numpad-btn clear-btn"
                      onClick={() => {
                        setCashInput("");
                        setChange(null);
                        setError(null);
                      }}
                    >
                      AC
                    </button>

                    <button
                      className="numpad-btn confirm-btn"
                      onClick={handleCashPayment}
                    >
                      ยืนยัน
                    </button>
                  </div>

                  {/* ปุ่มยืนยันชำระเงิน */}
                  <button
                    onClick={confirmCashPayment}
                    className="checkout-confirm-btn"
                    disabled={change === null || change < 0}
                  >
                    ยืนยันชำระเงิน
                  </button>
                </div>
              </div>
            )}


            {/* 📱 QR Code */}
            {showQR && (
              <div className="qr-modal-overlay">
                <div className="qr-modal-box">
                  <button className="qr-modal-close" onClick={() => setShowQR(false)}>
                    &times;
                  </button>
                  <h3 className="qr-title">สแกน QR Code เพื่อชำระเงิน</h3>
                  {qrCode && <QRCodeSVG value={qrCode} size={256} />}
                  <button onClick={confirmQRPayment} className="qr-confirm-btn">
                    ยืนยันชำระเงิน
                  </button>
                </div>
              </div>
            )}

            {/* 💳 Credit Card */}
            {showCredit && (
              <div className="credit-modal">
                <h3 className="credit-title">เลือกประเภทบัตรเครดิต</h3>
                <div className="credit-options">
                  {["Visa", "Mastercard", "JCB"].map((card) => (
                    <button
                      key={card}
                      className={`credit-option ${selectedCard === card ? "selected" : ""
                        }`}
                      onClick={() => setSelectedCard(card)}
                    >
                      {card}
                    </button>
                  ))}
                </div>
                <button
                  onClick={confirmCreditPayment}
                  className="credit-confirm-btn"
                  disabled={!selectedCard}
                >
                  ยืนยันชำระเงิน
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
