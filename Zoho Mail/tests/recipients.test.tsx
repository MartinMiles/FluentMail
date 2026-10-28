// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Recipients } from "../src/Recipients";
import { recipientMatches, rememberRecipients } from "../src/recipientHistory";
afterEach(cleanup);
const history = [
  "jamie@example.test",
  "james@example.test",
  "other@example.test",
];
function Field() {
  const [value, setValue] = useState("");
  return (
    <Recipients
      label="To recipients"
      value={value}
      onChange={setValue}
      disabled={false}
      history={history}
    />
  );
}
describe("recipient suggestions", () => {
  it("normalizes, deduplicates and bounds recently used addresses", () => {
    expect(
      rememberRecipients(
        ["jamie@example.test", "invalid"],
        ["James <JAMES@example.test>; jamie@example.test"],
      ),
    ).toEqual(["james@example.test", "jamie@example.test"]);
    expect(
      rememberRecipients(
        Array.from({ length: 1100 }, (_, i) => `user${i}@example.test`),
        [],
      ),
    ).toHaveLength(1000);
  });
  it("matches a two-character email prefix on the current token and excludes chosen recipients", () => {
    expect(recipientMatches("j", history)).toEqual([]);
    expect(recipientMatches("JA", history)).toEqual(history.slice(0, 2));
    expect(recipientMatches("jamie@example.test; ja", history)).toEqual([
      "james@example.test",
    ]);
    expect(recipientMatches("am", history)).toEqual([]);
  });
  it("supports keyboard selection, Escape dismissal and multiple recipients", async () => {
    render(<Field />);
    const user = userEvent.setup(),
      field = screen.getByRole("combobox");
    await user.type(field, "j");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(field, "a");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.keyboard("{ArrowDown}{Enter}");
    expect((field as HTMLInputElement).value).toBe("james@example.test, ");
    await user.type(field, "ja");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(field);
    await user.type(field, "m");
    await user.click(
      screen.getByRole("option", { name: "jamie@example.test" }),
    );
    expect((field as HTMLInputElement).value).toBe(
      "james@example.test, jamie@example.test, ",
    );
  });
});
