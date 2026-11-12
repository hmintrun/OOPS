import { notFound } from "next/navigation";
import { OopsDemo } from "./OopsDemo";
import "./demo.css";

export default function DemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <OopsDemo />;
}
