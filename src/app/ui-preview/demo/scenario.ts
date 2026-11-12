export const households = ["Hộ cô Mai", "Hộ chú Hùng", "Hộ chị Lan"];
export const scenario = {
  group: "Nhóm Khu phố 3",
  area: "Bình Thạnh",
  supplier: "Tạp hóa Bảy Hiền",
  item: "Nước uống đóng chai",
  price: 2_000,
  sellerCapacity: 10,
  otherHouseholds: [12, 18],
  initialPeople: 3,
  initialStock: 6,
  unitsPerPerson: 6,
};

const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
export const money = (amount: number) => currency.format(amount);
