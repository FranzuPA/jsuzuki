import { jsonOk, readBody, withUser } from "@/lib/api";
import { getSettings, updateSetting } from "@/lib/notifications/service";
import { notificationSettingSchema } from "@/lib/validation/notifications";

export const runtime = "nodejs";

export const GET = withUser(async (_request, { user }) => jsonOk(await getSettings(user.id)));

export const PATCH = withUser(async (request, { user }) => {
  const input = await readBody(request, notificationSettingSchema);
  const { kind, ...values } = input;
  await updateSetting(user.id, kind, values);
  return jsonOk(await getSettings(user.id));
});
