import { z } from "zod";
import { displayNameInput } from "@/contracts/foundation";
import { resolveLoginNext } from "./login-next";
import { userLocation } from "./locations";
import { phoneInput } from "./receiving-contact";

export const MIN_SIGNUP_PASSWORD_LENGTH = 9;

export const registrationInput = z.object({
  name: displayNameInput,
  email: z.string().trim().pipe(z.email("Email không hợp lệ.")),
  phone: phoneInput,
  password: z.string().min(MIN_SIGNUP_PASSWORD_LENGTH, `Mật khẩu cần ít nhất ${MIN_SIGNUP_PASSWORD_LENGTH} ký tự.`),
  confirmPassword: z.string(),
  location: userLocation,
}).refine(input => input.password === input.confirmPassword, {
  message: "Mật khẩu nhập lại chưa khớp.", path: ["confirmPassword"],
});

export function confirmationUrl(origin: string, next: string | null) {
  const url = new URL("/login/confirm", origin);
  url.searchParams.set("next", resolveLoginNext(next));
  return url.toString();
}

export function accountErrorMessage(error: unknown, action: "signup" | "login" | "resend") {
  const { code, status } = (error ?? {}) as { code?: string; status?: number };
  if (status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return "Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ vài phút rồi thử lại.";
  }
  switch (code) {
    case "user_already_exists":
    case "email_exists": return "Email này đã có tài khoản. Hãy chuyển sang đăng nhập.";
    case "email_not_confirmed": return "Email chưa được xác nhận. Kiểm tra hộp thư hoặc gửi lại email xác nhận.";
    case "invalid_credentials": return "Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.";
    case "weak_password": return "Mật khẩu chưa đủ mạnh. Hãy dùng mật khẩu dài hơn, có chữ hoa, chữ thường, số và ký tự đặc biệt.";
    case "email_address_invalid": return "Email không hợp lệ. Vui lòng kiểm tra lại địa chỉ.";
    case "email_address_not_authorized": return "Dịch vụ email hiện chưa cho phép gửi tới địa chỉ này. Vui lòng liên hệ quản trị viên để mở đăng ký.";
    case "signup_disabled": return "Đăng ký tài khoản đang tạm đóng. Vui lòng thử lại sau.";
  }
  const operation = action === "signup" ? "đăng ký" : action === "resend" ? "gửi email xác nhận" : "đăng nhập";
  return `Không ${operation} được. Vui lòng kiểm tra kết nối và thử lại.`;
}
