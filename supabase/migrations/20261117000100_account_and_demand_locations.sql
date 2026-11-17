-- Official HCMC administrative codes: Decision 19/2025/QD-TTg, Cong Bao 921+922 pp.45-52.
-- Current two-level hierarchy; legacy district fields retain their original meaning.
create table public.administrative_wards (
  province_code text not null check (province_code = '79'),
  code text not null check (code ~ '^[0-9]{5}$'),
  name text not null,
  kind text not null check (kind in ('Phường', 'Xã', 'Đặc khu')),
  primary key (province_code, code)
);
alter table public.administrative_wards enable row level security;
revoke all on public.administrative_wards from anon, authenticated;

insert into public.administrative_wards (province_code, code, name, kind) values
('79', '25747', 'Phường Thủ Dầu Một', 'Phường'),
('79', '25750', 'Phường Phú Lợi', 'Phường'),
('79', '25760', 'Phường Bình Dương', 'Phường'),
('79', '25768', 'Phường Phú An', 'Phường'),
('79', '25771', 'Phường Chánh Hiệp', 'Phường'),
('79', '25813', 'Phường Bến Cát', 'Phường'),
('79', '25837', 'Phường Chánh Phú Hòa', 'Phường'),
('79', '25840', 'Phường Long Nguyên', 'Phường'),
('79', '25843', 'Phường Tây Nam', 'Phường'),
('79', '25846', 'Phường Thới Hòa', 'Phường'),
('79', '25849', 'Phường Hòa Lợi', 'Phường'),
('79', '25888', 'Phường Tân Uyên', 'Phường'),
('79', '25891', 'Phường Tân Khánh', 'Phường'),
('79', '25912', 'Phường Vĩnh Tân', 'Phường'),
('79', '25915', 'Phường Bình Cơ', 'Phường'),
('79', '25920', 'Phường Tân Hiệp', 'Phường'),
('79', '25942', 'Phường Dĩ An', 'Phường'),
('79', '25945', 'Phường Tân Đông Hiệp', 'Phường'),
('79', '25951', 'Phường Đông Hòa', 'Phường'),
('79', '25966', 'Phường Lái Thiêu', 'Phường'),
('79', '25969', 'Phường Thuận Giao', 'Phường'),
('79', '25975', 'Phường An Phú', 'Phường'),
('79', '25978', 'Phường Thuận An', 'Phường'),
('79', '25987', 'Phường Bình Hòa', 'Phường'),
('79', '26506', 'Phường Vũng Tàu', 'Phường'),
('79', '26526', 'Phường Tam Thắng', 'Phường'),
('79', '26536', 'Phường Rạch Dừa', 'Phường'),
('79', '26542', 'Phường Phước Thắng', 'Phường'),
('79', '26560', 'Phường Bà Rịa', 'Phường'),
('79', '26566', 'Phường Long Hương', 'Phường'),
('79', '26572', 'Phường Tam Long', 'Phường'),
('79', '26704', 'Phường Phú Mỹ', 'Phường'),
('79', '26710', 'Phường Tân Hải', 'Phường'),
('79', '26713', 'Phường Tân Phước', 'Phường'),
('79', '26725', 'Phường Tân Thành', 'Phường'),
('79', '26737', 'Phường Tân Định', 'Phường'),
('79', '26740', 'Phường Sài Gòn', 'Phường'),
('79', '26743', 'Phường Bến Thành', 'Phường'),
('79', '26758', 'Phường Cầu Ông Lãnh', 'Phường'),
('79', '26767', 'Phường An Phú Đông', 'Phường'),
('79', '26773', 'Phường Thới An', 'Phường'),
('79', '26782', 'Phường Tân Thới Hiệp', 'Phường'),
('79', '26785', 'Phường Trung Mỹ Tây', 'Phường'),
('79', '26791', 'Phường Đông Hưng Thuận', 'Phường'),
('79', '26800', 'Phường Linh Xuân', 'Phường'),
('79', '26803', 'Phường Tam Bình', 'Phường'),
('79', '26809', 'Phường Hiệp Bình', 'Phường'),
('79', '26824', 'Phường Thủ Đức', 'Phường'),
('79', '26833', 'Phường Long Bình', 'Phường'),
('79', '26842', 'Phường Tăng Nhơn Phú', 'Phường'),
('79', '26848', 'Phường Phước Long', 'Phường'),
('79', '26857', 'Phường Long Phước', 'Phường'),
('79', '26860', 'Phường Long Trường', 'Phường'),
('79', '26876', 'Phường An Nhơn', 'Phường'),
('79', '26878', 'Phường An Hội Đông', 'Phường'),
('79', '26882', 'Phường An Hội Tây', 'Phường'),
('79', '26884', 'Phường Gò Vấp', 'Phường'),
('79', '26890', 'Phường Hạnh Thông', 'Phường'),
('79', '26898', 'Phường Thông Tây Hội', 'Phường'),
('79', '26905', 'Phường Bình Lợi Trung', 'Phường'),
('79', '26911', 'Phường Bình Quới', 'Phường'),
('79', '26929', 'Phường Bình Thạnh', 'Phường'),
('79', '26944', 'Phường Gia Định', 'Phường'),
('79', '26956', 'Phường Thạnh Mỹ Tây', 'Phường'),
('79', '26968', 'Phường Tân Sơn Nhất', 'Phường'),
('79', '26977', 'Phường Tân Sơn Hòa', 'Phường'),
('79', '26983', 'Phường Bảy Hiền', 'Phường'),
('79', '26995', 'Phường Tân Hòa', 'Phường'),
('79', '27004', 'Phường Tân Bình', 'Phường'),
('79', '27007', 'Phường Tân Sơn', 'Phường'),
('79', '27013', 'Phường Tây Thạnh', 'Phường'),
('79', '27019', 'Phường Tân Sơn Nhì', 'Phường'),
('79', '27022', 'Phường Phú Thọ Hòa', 'Phường'),
('79', '27028', 'Phường Phú Thạnh', 'Phường'),
('79', '27031', 'Phường Tân Phú', 'Phường'),
('79', '27043', 'Phường Đức Nhuận', 'Phường'),
('79', '27058', 'Phường Cầu Kiệu', 'Phường'),
('79', '27073', 'Phường Phú Nhuận', 'Phường'),
('79', '27094', 'Phường An Khánh', 'Phường'),
('79', '27097', 'Phường Bình Trưng', 'Phường'),
('79', '27112', 'Phường Cát Lái', 'Phường'),
('79', '27139', 'Phường Xuân Hòa', 'Phường'),
('79', '27142', 'Phường Nhiêu Lộc', 'Phường'),
('79', '27154', 'Phường Bàn Cờ', 'Phường'),
('79', '27163', 'Phường Hòa Hưng', 'Phường'),
('79', '27169', 'Phường Diên Hồng', 'Phường'),
('79', '27190', 'Phường Vườn Lài', 'Phường'),
('79', '27211', 'Phường Hòa Bình', 'Phường'),
('79', '27226', 'Phường Phú Thọ', 'Phường'),
('79', '27232', 'Phường Bình Thới', 'Phường'),
('79', '27238', 'Phường Minh Phụng', 'Phường'),
('79', '27259', 'Phường Xóm Chiếu', 'Phường'),
('79', '27265', 'Phường Khánh Hội', 'Phường'),
('79', '27286', 'Phường Vĩnh Hội', 'Phường'),
('79', '27301', 'Phường Chợ Quán', 'Phường'),
('79', '27316', 'Phường An Đông', 'Phường'),
('79', '27343', 'Phường Chợ Lớn', 'Phường'),
('79', '27349', 'Phường Phú Lâm', 'Phường'),
('79', '27364', 'Phường Bình Phú', 'Phường'),
('79', '27367', 'Phường Bình Tây', 'Phường'),
('79', '27373', 'Phường Bình Tiên', 'Phường'),
('79', '27418', 'Phường Chánh Hưng', 'Phường'),
('79', '27424', 'Phường Bình Đông', 'Phường'),
('79', '27427', 'Phường Phú Định', 'Phường'),
('79', '27439', 'Phường Bình Hưng Hòa', 'Phường'),
('79', '27442', 'Phường Bình Tân', 'Phường'),
('79', '27448', 'Phường Bình Trị Đông', 'Phường'),
('79', '27457', 'Phường Tân Tạo', 'Phường'),
('79', '27460', 'Phường An Lạc', 'Phường'),
('79', '27475', 'Phường Tân Hưng', 'Phường'),
('79', '27478', 'Phường Tân Thuận', 'Phường'),
('79', '27484', 'Phường Phú Thuận', 'Phường'),
('79', '27487', 'Phường Tân Mỹ', 'Phường'),
('79', '25777', 'Xã Dầu Tiếng', 'Xã'),
('79', '25780', 'Xã Minh Thạnh', 'Xã'),
('79', '25792', 'Xã Long Hòa', 'Xã'),
('79', '25807', 'Xã Thanh An', 'Xã'),
('79', '25819', 'Xã Trừ Văn Thố', 'Xã'),
('79', '25822', 'Xã Bàu Bàng', 'Xã'),
('79', '25858', 'Xã Phú Giáo', 'Xã'),
('79', '25864', 'Xã Phước Thành', 'Xã'),
('79', '25867', 'Xã An Long', 'Xã'),
('79', '25882', 'Xã Phước Hòa', 'Xã'),
('79', '25906', 'Xã Bắc Tân Uyên', 'Xã'),
('79', '25909', 'Xã Thường Tân', 'Xã'),
('79', '26545', 'Xã Long Sơn', 'Xã'),
('79', '26575', 'Xã Ngãi Giao', 'Xã'),
('79', '26584', 'Xã Xuân Sơn', 'Xã'),
('79', '26590', 'Xã Bình Giã', 'Xã'),
('79', '26596', 'Xã Châu Đức', 'Xã'),
('79', '26608', 'Xã Kim Long', 'Xã'),
('79', '26617', 'Xã Nghĩa Thành', 'Xã'),
('79', '26620', 'Xã Hồ Tràm', 'Xã'),
('79', '26632', 'Xã Xuyên Mộc', 'Xã'),
('79', '26638', 'Xã Bàu Lâm', 'Xã'),
('79', '26641', 'Xã Hòa Hội', 'Xã'),
('79', '26647', 'Xã Hòa Hiệp', 'Xã'),
('79', '26656', 'Xã Bình Châu', 'Xã'),
('79', '26659', 'Xã Long Điền', 'Xã'),
('79', '26662', 'Xã Long Hải', 'Xã'),
('79', '26680', 'Xã Đất Đỏ', 'Xã'),
('79', '26686', 'Xã Phước Hải', 'Xã'),
('79', '26728', 'Xã Châu Pha', 'Xã'),
('79', '27496', 'Xã Tân An Hội', 'Xã'),
('79', '27508', 'Xã An Nhơn Tây', 'Xã'),
('79', '27511', 'Xã Nhuận Đức', 'Xã'),
('79', '27526', 'Xã Thái Mỹ', 'Xã'),
('79', '27541', 'Xã Phú Hòa Đông', 'Xã'),
('79', '27544', 'Xã Bình Mỹ', 'Xã'),
('79', '27553', 'Xã Củ Chi', 'Xã'),
('79', '27559', 'Xã Hóc Môn', 'Xã'),
('79', '27568', 'Xã Đông Thạnh', 'Xã'),
('79', '27577', 'Xã Xuân Thới Sơn', 'Xã'),
('79', '27592', 'Xã Bà Điểm', 'Xã'),
('79', '27595', 'Xã Tân Nhựt', 'Xã'),
('79', '27601', 'Xã Vĩnh Lộc', 'Xã'),
('79', '27604', 'Xã Tân Vĩnh Lộc', 'Xã'),
('79', '27610', 'Xã Bình Lợi', 'Xã'),
('79', '27619', 'Xã Bình Hưng', 'Xã'),
('79', '27628', 'Xã Hưng Long', 'Xã'),
('79', '27637', 'Xã Bình Chánh', 'Xã'),
('79', '27655', 'Xã Nhà Bè', 'Xã'),
('79', '27658', 'Xã Hiệp Phước', 'Xã'),
('79', '27664', 'Xã Cần Giờ', 'Xã'),
('79', '27667', 'Xã Bình Khánh', 'Xã'),
('79', '27673', 'Xã An Thới Đông', 'Xã'),
('79', '27676', 'Xã Thạnh An', 'Xã'),
('79', '26732', 'Đặc khu Côn Đảo', 'Đặc khu')
;

alter table public.profiles
  add column province_code text,
  add column ward_code text,
  add constraint profiles_location_pair check ((province_code is null) = (ward_code is null)),
  add constraint profiles_location_fk foreign key (province_code, ward_code)
    references public.administrative_wards (province_code, code);

alter table public.groups
  add column province_code text,
  add constraint groups_location_fk foreign key (province_code, ward_code)
    references public.administrative_wards (province_code, code);

alter table public.demand_items
  add column province_code text,
  add column district_code text not null default '',
  add column ward_code text not null default '',
  add constraint demand_location_fk foreign key (province_code, ward_code)
    references public.administrative_wards (province_code, code);

-- Preserve old published needs with their current group location; do not guess new codes.
update public.demand_items d
set province_code = g.province_code, district_code = g.district_code, ward_code = g.ward_code
from public.campaigns c join public.groups g on g.id = c.group_id
where c.id = d.campaign_id;

create function public.snapshot_demand_location() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    select g.province_code, g.district_code, g.ward_code
    into NEW.province_code, NEW.district_code, NEW.ward_code
    from public.campaigns c join public.groups g on g.id = c.group_id
    where c.id = NEW.campaign_id;
    if not found then raise exception 'Campaign does not exist' using errcode = '23503'; end if;
  elsif (NEW.province_code, NEW.district_code, NEW.ward_code, NEW.campaign_id)
    is distinct from (OLD.province_code, OLD.district_code, OLD.ward_code, OLD.campaign_id) then
    raise exception 'Published demand location is immutable' using errcode = '23514';
  end if;
  return NEW;
end;
$$;

create trigger demand_location_snapshot before insert or update on public.demand_items
for each row execute function public.snapshot_demand_location();

create index demand_items_location on public.demand_items (province_code, ward_code);
