import { Client, GatewayIntentBits, Partials } from "discord.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// Optional filters (recommended)
const TARGET_GUILD_ID = process.env.TARGET_GUILD_ID || null;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || null;

// Comma-separated allowed emojis, e.g. "1️⃣,2️⃣,3️⃣,4️⃣,✅"
const ALLOWED_EMOJIS = (process.env.ALLOWED_EMOJIS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// If true, only fire when the reaction count hits N (useful for “needs 3 reacts” logic)
const TRIGGER_ON_COUNT = process.env.TRIGGER_ON_COUNT
  ? Number(process.env.TRIGGER_ON_COUNT)
  : null;

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN env var");
if (!N8N_WEBHOOK_URL) throw new Error("Missing N8N_WEBHOOK_URL env var");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent // needed if you want message content in payload
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

function getEmojiKey(reaction) {
  // For unicode emoji: reaction.emoji.name (e.g. "✅" or "1️⃣")
  // For custom emoji: reaction.emoji.id exists; name also exists.
  return reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name;
}

async function postToN8n(payload) {
  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("❌ n8n webhook failed:", res.status, txt);
  } else {
    console.log("➡️ Triggered n8n webhook");
  }
}

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;

    // Make sure we have full objects
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const msg = reaction.message;
    const emojiKey = getEmojiKey(reaction);

    // Filters
    if (TARGET_GUILD_ID && msg.guildId !== TARGET_GUILD_ID) return;
    if (TARGET_CHANNEL_ID && msg.channelId !== TARGET_CHANNEL_ID) return;

    if (ALLOWED_EMOJIS.length > 0) {
      // ALLOWED_EMOJIS supports both unicode (✅) and custom format (name:id)
      if (!ALLOWED_EMOJIS.includes(emojiKey) && !ALLOWED_EMOJIS.includes(reaction.emoji.name)) return;
    }

    // Optionally require count threshold
    if (TRIGGER_ON_COUNT !== null) {
      const currentCount = reaction.count ?? null;
      if (currentCount !== TRIGGER_ON_COUNT) return;
    }

    const payload = {
      event: "reaction_add",
      emoji: {
        key: emojiKey,
        name: reaction.emoji.name,
        id: reaction.emoji.id || null
      },
      reactionCount: reaction.count ?? null,
      user: {
        id: user.id,
        username: user.username,
        tag: user.tag
      },
      message: {
        id: msg.id,
        url: msg.url,
        channelId: msg.channelId,
        guildId: msg.guildId,
        authorId: msg.author?.id || null,
        content: msg.content || null,
        createdTimestamp: msg.createdTimestamp
      },
      timestamp: new Date().toISOString()
    };

    await postToN8n(payload);
  } catch (err) {
    console.error("❌ reaction handler error:", err);
  }
});

client.login(DISCORD_TOKEN);
