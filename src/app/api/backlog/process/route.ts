import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/google-auth"
import OpenAI from "openai"
import Anthropic from "@anthropic-ai/sdk"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const WHISPER_MAX_SIZE = 25 * 1024 * 1024

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const accessToken = (session as unknown as Record<string, unknown>)?.accessToken as string | undefined

  if (!accessToken) {
    return NextResponse.json({ error: "Nie zalogowany do Google" }, { status: 401 })
  }

  const { fileId, fileName } = await req.json()
  if (!fileId || !fileName) {
    return NextResponse.json({ error: "fileId i fileName wymagane" }, { status: 400 })
  }

  // 1. Download file from Google Drive
  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!driveRes.ok) {
    return NextResponse.json(
      { error: `Nie udalo sie pobrac pliku z Drive: ${driveRes.statusText}` },
      { status: 500 }
    )
  }

  const audioBuffer = await driveRes.arrayBuffer()

  if (audioBuffer.byteLength > WHISPER_MAX_SIZE) {
    return NextResponse.json(
      { error: "Plik za duzy (max 25MB)" },
      { status: 413 }
    )
  }

  // 2. Transcribe with Whisper
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const ext = fileName.split(".").pop() || "m4a"
  const mimeMap: Record<string, string> = {
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
  }
  const mimeType = mimeMap[ext] || "audio/mp4"

  const audioFile = new File([audioBuffer], fileName, { type: mimeType })

  let transcript: string
  try {
    const whisperRes = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
    })
    transcript = whisperRes.text
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Whisper error"
    return NextResponse.json({ error: `Transkrypcja nie powiodla sie: ${msg}` }, { status: 500 })
  }

  // 3. Classify with Claude
  const today = new Date().toISOString().split("T")[0]
  const classificationPrompt = `Jestes asystentem Jana, ktory przetwarza surowe notatki glosowe na strukturyzowane wpisy backlogu.

Kontekst:
- 5 Filarow: 1=Zdrowie i Fitness, 2=Rozwoj Osobisty, 3=Relacje i Partnerstwo, 4=Praca, 5=Duchowosc
- Projekty (tylko dla filaru 4): ovoc, plantacja, inne
- Priorytet: A=krytyczne, B=wazne wkrotce, C=przydatne, D=deleguj, E=eliminuj
- WIG (Wildly Important Goal) = najwazniejszy cel, oznaczaj is_wig: true

TRANSKRYPCJA:
${transcript}

Wyodrebnij KAZDA osobna mysl jako oddzielny wpis.
Zwroc TYLKO tablice JSON (bez markdown, bez komentarzy):

[{
  "title": "max 80 znakow",
  "description": "opcjonalny opis lub null",
  "type": "task|idea|note|goal|question",
  "pillar": 1-5,
  "project": "ovoc|plantacja|inne|null",
  "priority": "A|B|C|D|E",
  "is_wig": false,
  "due_date": "YYYY-MM-DD lub null"
}]

TYPE:
- task = konkretne dzialanie do wykonania
- idea = pomysl wymagajacy oceny
- note = obserwacja / refleksja
- goal = cel / intencja / kierunek
- question = pytanie otwarte

DUE_DATE: wyciagaj z kontekstu ("do piatku" = najblizszy piatek, "w przyszlym tygodniu" = poniedzialek, "do konca miesiaca" = ostatni dzien miesiaca). Dzisiejsza data: ${today}.`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let items
  try {
    const claudeRes = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0,
      messages: [{ role: "user", content: classificationPrompt }],
    })

    const text =
      claudeRes.content[0].type === "text" ? claudeRes.content[0].text : ""
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    items = JSON.parse(cleaned)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Claude error"
    return NextResponse.json({ error: `Klasyfikacja nie powiodla sie: ${msg}` }, { status: 500 })
  }

  return NextResponse.json({ transcript, items })
}
