import { expect, it } from "vitest";
import { orderProgress, orderTabs } from "@/app/orders/order-progress";

it("keeps the five requested stages and treats settling as unfinished", () => {
  expect(orderTabs.map(tab => tab.label)).toEqual(["Tất cả", "Chờ thương lượng", "Ký & Cọc", "Bàn giao", "Đã xong"]);
  expect(orderTabs.find(tab => tab.key === "completed")?.states).toEqual(["COMPLETED"]);
  expect(orderProgress("SETTLING")).toEqual({ tone: "violet", anchor: "settlement" });
});

it("routes each stage to a visible section of the order detail", () => {
  expect(orderProgress("AWAIT_COMMITMENTS")).toEqual({ tone: "sky", anchor: "commitments" });
  expect(orderProgress("AWAIT_HANDOFF")).toEqual({ tone: "violet", anchor: "handoff" });
  expect(orderProgress("COMPLETED")).toEqual({ tone: "green", anchor: "settlement" });
  expect(orderProgress("CANCELED").tone).toBe("rose");
});
