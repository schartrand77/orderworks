import "dotenv/config";
import { sendTestEmail } from "@/lib/email";

async function main() {
  const recipient = process.argv[2] ?? "info@makerworks.app";
  await sendTestEmail(recipient);
  console.log(`Email sent to ${recipient}`);
}

main().catch((error) => {
  console.error("send failed", error);
  process.exit(1);
});
