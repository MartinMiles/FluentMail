import {
  Pacer,
  ZohoTransport,
  remoteId,
  type Fetcher,
  type Secret,
} from "./transport";
import { ZohoMail } from "./zoho";
import { addresses, type Folder, type ListResult } from "../src/shared";
import { inspectMimeImages } from "./mimeImages";

export type DiagnosticReport = {
  steps: { operation: string; ok: boolean }[];
  images?: ReturnType<typeof inspectMimeImages>;
  lookup?: {
    listedMessages: number;
    matchingSubject: number;
    matchingRecipient: number;
  };
  failure?: {
    operation: string;
    httpStatus?: number;
    apiStatus?: number;
    providerCode?: string;
    category?: string;
    message: string;
  };
};
/** No raw bodies, provider prose, addresses, IDs, query values or credentials leave this function. */
function providerDetails(data: any) {
  const code = data?.data?.errorCode ?? data?.errorCode;
  const value =
    typeof code === "string" || typeof code === "number" ? String(code) : "";
  const providerCode =
    /^(?:(?:INVALID|AUTH|UNAUTHORIZED|FORBIDDEN|ACCESS|SCOPE|URL|MAIL|ACCOUNT|PERMISSION|LIMIT|RATE|USER|FOLDER|LESS|MORE|EXTRA|PATTERN|NO_SUCH)[A-Z0-9_]{0,65}|[0-9]{3,6})$/.test(
      value,
    )
      ? value
      : undefined;
  const description = String(
    data?.data?.errorMessage || data?.errorMessage || "",
  );
  const combined = value + " " + description;
  const category = /scope/i.test(combined)
    ? "OAuth scope"
    : /account/i.test(combined)
      ? "Mailbox account"
      : /permission|forbidden|access.denied/i.test(combined)
        ? "Access permission"
        : /parameter|input|argument/i.test(combined)
          ? "Request parameter"
          : undefined;
  return { providerCode, category };
}

/** A live run needs separate owner approval. One refresh, then serial read-only probes;
 * stop on the first failure, no retries, no poller, and no persistent settings writes.
 * Injected fetch is mandatory so tests cannot accidentally default to live access.
 */
export async function diagnoseMailbox(
  secret: Secret,
  fetcher: Fetcher,
  pacer = new Pacer(),
  imageSubject?: string,
  imageRecipient?: string,
): Promise<DiagnosticReport> {
  const report: DiagnosticReport = { steps: [] };
  let operation = "authorization";
  let rejected:
    | {
        httpStatus: number;
        apiStatus?: number;
        providerCode?: string;
        category?: string;
      }
    | undefined;
  const observed: Fetcher = async (url, init) => {
    const response = await fetcher(url, init);
    if (!url.endsWith("/token")) {
      try {
        const body = await response.clone().json();
        const status = Number(body?.status?.code);
        if (!response.ok || status >= 400)
          rejected = {
            httpStatus: response.status,
            apiStatus: Number.isFinite(status) ? status : undefined,
            ...providerDetails(body),
          };
      } catch {
        /* The transport handles unexpected bodies and stops the connection. */
      }
    }
    return response;
  };
  const transport = new ZohoTransport(
    { ...secret },
    { save: () => {} },
    pacer,
    observed,
  );
  const client = new ZohoMail(transport);
  const step = async <T>(label: string, action: () => Promise<T>) => {
    operation = label;
    const result = await action();
    report.steps.push({ operation: label, ok: true });
    return result;
  };
  try {
    await step("authorization", () => transport.authorize());
    const accounts = await step("account discovery", () =>
      client.loadAccounts(),
    );
    const account = accounts.find((a) =>
      a.aliases.some(
        (email) => email.toLowerCase() === secret.email.toLowerCase(),
      ),
    )!;
    const ref = { profileId: secret.id, accountId: account.id };
    const folders = await step(
      "folder loading",
      () => client.execute({ op: "folders", ...ref }) as Promise<Folder[]>,
    );
    if (imageSubject !== undefined) {
      const sent = folders.find((f) => f.path.toLowerCase() === "/sent");
      if (!sent)
        throw new Error("Sent folder unavailable. Diagnostic stopped.");
      const page = await step(
        "recent Sent listing",
        () =>
          client.execute({
            op: "list",
            ...ref,
            folderId: sent.id,
            filter: "all",
            start: 1,
          }) as Promise<ListResult>,
      );
      const normalize = (subject: string) =>
        subject.trim().replace(/:$/, "").trim().toLowerCase();
      report.lookup = {
        listedMessages: page.messages.length,
        matchingSubject: page.messages.filter(
          (m) => normalize(m.subject) === normalize(imageSubject),
        ).length,
        matchingRecipient: page.messages.filter(
          (m) =>
            !imageRecipient ||
            addresses(m.to).includes(imageRecipient.toLowerCase()),
        ).length,
      };
      operation = "matching the specified Sent message";
      const message = page.messages
        .filter(
          (m) =>
            m.subject.trim().replace(/:$/, "").trim().toLowerCase() ===
              imageSubject.trim().replace(/:$/, "").trim().toLowerCase() &&
            (!imageRecipient ||
              addresses(m.to).includes(imageRecipient.toLowerCase())),
        )
        .sort((a, b) => b.time - a.time)[0];
      if (!message)
        throw new Error(
          "The specified subject was not found in the newest 40 Sent messages. No further read was made.",
        );
      const original = await step("selected message MIME", () =>
        transport.request(
          "/api/accounts/" +
            remoteId(account.id) +
            "/messages/" +
            remoteId(message.id) +
            "/originalmessage",
        ),
      );
      if (typeof original?.content !== "string")
        throw new Error("Original MIME was unavailable.");
      report.images = inspectMimeImages(original.content);
      return report;
    }
    await step("label loading", () => client.execute({ op: "labels", ...ref }));
    const inbox = folders.find((f) => f.path.toLowerCase() === "/inbox");
    if (inbox)
      await step(
        "Inbox listing",
        () =>
          client.execute({
            op: "list",
            ...ref,
            folderId: inbox.id,
            filter: "all",
            start: 1,
          }) as Promise<ListResult>,
      );
  } catch (error) {
    report.steps.push({ operation, ok: false });
    report.failure = {
      operation,
      ...rejected,
      message: error instanceof Error ? error.message : "Diagnostic stopped.",
    };
  } finally {
    transport.disconnect();
  }
  return report;
}
