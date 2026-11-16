// Shop / payee name from a bank description. Pure (no DB, no Node APIs) — safe in the browser.
// The single copy: finanse-db re-exports it, the /finanse page imports it directly.

export function extractMerchant(description: string): string {
  // Card payment: "DOP. MC ... PŁATNOŚĆ KARTĄ 80.49 PLN OPENAI *CHATGPT SUBSCR DUBLIN"
  const cardMatch = description.match(/PŁATNOŚĆ KARTĄ [\d,.]+ PLN (.+)/);
  if (cardMatch) return cardMatch[1].trim();

  // BLIK
  if (description.includes("Zakup BLIK")) {
    const blikMatch = description.match(/Zakup BLIK (.+?) ref:/);
    return blikMatch ? blikMatch[1].trim() : "BLIK";
  }

  // Standing order: "Platnosc powtarzalna {payee} ..."
  const standingMatch = description.match(/Platnosc powtarzalna ([^\s].*?) (sp\b|S\.A\.|ul\.|ref:|$)/i);
  if (standingMatch) return standingMatch[1].trim();

  return description;
}
