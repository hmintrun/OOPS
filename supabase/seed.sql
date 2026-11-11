insert into public.catalog_items (id, code, name, category, unit) values
  ('e7509c34-3063-4be5-8428-77ff563ad1a1', 'WATER_BOTTLE', 'Nước uống', 'WATER', 'chai'),
  ('e7509c34-3063-4be5-8428-77ff563ad1a2', 'RICE_KG', 'Gạo', 'FOOD', 'kg'),
  ('e7509c34-3063-4be5-8428-77ff563ad1a3', 'BATTERY_AA', 'Pin AA', 'ESSENTIALS', 'viên')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  unit = excluded.unit
where catalog_items.code = excluded.code;
