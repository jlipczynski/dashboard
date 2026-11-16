import { describe, it, expect } from "vitest";
import { classifyIntermediary } from "../lib/finanse-intermediaries";

// Fake card number only — this repo is public.
const card = (amount: string, merchant: string) =>
  `DOP. MC 000000******0000 PŁATNOŚĆ KARTĄ ${amount} PLN ${merchant}`;

describe("classifyIntermediary — prefixed (shop name after prefix)", () => {
  it.each([
    ["PAYPAL *ZOOPLUS SE 4029357733", "PayPal", "ZOOPLUS SE"],
    ["PeP*Ciastko i Kawa BOROWIEC", "PeP", "Ciastko i Kawa BOROWIEC"],
    ["SumUp *MD PARTNER Poznan", "SumUp", "MD PARTNER Poznan"],
    ["P24*AQUANET SA Poznan", "P24", "AQUANET SA Poznan"],
    ["PP*medistore.com.p Warszawa", "PP", "medistore.com.p Warszawa"],
    ["IdoPay *INCOIN POLSKA Czestochowa", "IdoPay", "INCOIN POLSKA Czestochowa"],
  ])("%s", (merchant, provider, cleanMerchant) => {
    expect(classifyIntermediary(card("10.00", merchant), null, merchant)).toEqual({
      kind: "prefixed",
      provider,
      cleanMerchant,
    });
  });
});

describe("classifyIntermediary — opaque (shop unknown)", () => {
  it("Apple", () => {
    const m = "APPLE.COM/BILL CORK";
    expect(classifyIntermediary(card("9.99", m), null, m)).toEqual({
      kind: "opaque",
      provider: "Apple",
      cleanMerchant: m,
    });
  });

  it("PayU via counterparty", () => {
    const desc = "/OPT/X///// PayU XX5333224857XX Oplata za faktury";
    expect(classifyIntermediary(desc, "PayU S.A.,ul. Grunwaldzka 186,60-166 Poznań", desc)).toEqual({
      kind: "opaque",
      provider: "PayU",
      cleanMerchant: desc,
    });
  });

  it("PayPro (BLIK)", () => {
    const desc = "Zakup BLIK PayPro S.A. ul. Pastelowa 8 ref:123";
    const merchant = "PayPro S.A. ul. Pastelowa 8";
    expect(classifyIntermediary(desc, "PayPro S.A. ul. Pastelowa 8", merchant)).toEqual({
      kind: "opaque",
      provider: "PayPro",
      cleanMerchant: merchant,
    });
  });

  it("opaque wins over prefixed", () => {
    const m = "PAYPAL *SHOP 12345678";
    expect(classifyIntermediary(card("5.00", m), "PayU S.A.", m).kind).toBe("opaque");
  });
});

describe("classifyIntermediary — regular transactions", () => {
  it.each([
    [card("42.10", "LIDL OBORNICKA Suchy Las"), "LIDL OBORNICKA Suchy Las"],
    ["Gotówka: Pani magda", "Gotówka: Pani magda"],
  ])("%s", (desc, merchant) => {
    expect(classifyIntermediary(desc, null, merchant)).toEqual({
      kind: null,
      provider: null,
      cleanMerchant: merchant,
    });
  });
});
