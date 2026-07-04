const owner = process.env.PROFILE_LOGIN || process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!owner) {
  throw new Error("PROFILE_LOGIN or GITHUB_REPOSITORY_OWNER is required.");
}

if (!token) {
  throw new Error("GITHUB_TOKEN or GH_TOKEN is required.");
}

const timeZone = process.env.PROFILE_TIMEZONE || "America/Bogota";
const today = getTodayParts(timeZone);
const year = today.year;
const from = `${year}-01-01T00:00:00Z`;
const to = new Date(Date.UTC(today.year, today.month - 1, today.day + 1)).toISOString();
const localToday = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;

const query = `
query ProfileActivity($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC) {
      totalCount
    }
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "github-profile-activity-panel",
  },
  body: JSON.stringify({ query, variables: { login: owner, from, to } }),
});

const payload = await response.json();

if (!response.ok || payload.errors) {
  throw new Error(JSON.stringify(payload.errors || payload, null, 2));
}

const user = payload.data.user;
const days = user.contributionsCollection.contributionCalendar.weeks
  .flatMap((week) => week.contributionDays)
  .filter((day) => day.date >= `${year}-01-01` && day.date <= localToday)
  .sort((a, b) => a.date.localeCompare(b.date));

const total = user.contributionsCollection.contributionCalendar.totalContributions;
const repos = user.repositories.totalCount;
const last31 = days.slice(-31);
const currentStreak = getCurrentStreak(days);
const longest = getLongestStreak(days);
const max = Math.max(1, ...last31.map((day) => day.contributionCount));

const chart = {
  x: 96,
  y: 368,
  width: 908,
  height: 132,
};

const points = last31.map((day, index) => {
  const x = chart.x + (index * chart.width) / Math.max(1, last31.length - 1);
  const y = chart.y + chart.height - (day.contributionCount / max) * (chart.height - 14);
  return {
    x: round(x),
    y: round(y),
    date: day.date,
    count: day.contributionCount,
  };
});

const labels = points
  .filter((_, index) => index % 5 === 0 || index === points.length - 1)
  .map((point) => {
    const day = Number(point.date.slice(-2));
    return `<text x="${point.x}" y="532" text-anchor="middle" fill="#6ea8ff" font-family="Consolas, monospace" font-size="12">${day}</text>`;
  })
  .join("\n      ");

const circles = points
  .map((point) => {
    const active = point.count > 0;
    const radius = active ? 5 : 4;
    const fill = active ? "#67e8f9" : "#4b5f7a";
    const opacity = active ? "1" : ".72";
    return `<circle cx="${point.x}" cy="${point.y}" r="${radius}" fill="${fill}" opacity="${opacity}"><title>${point.date}: ${point.count} contributions</title></circle>`;
  })
  .join("\n      ");

const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
const rangeLabel = `${formatDate(days[0]?.date)} - ${formatDate(days.at(-1)?.date)}`;
const streakLabel = currentStreak.count > 0 ? formatRange(currentStreak.start, currentStreak.end) : "No active streak";
const longestLabel = longest.count > 0 ? formatRange(longest.start, longest.end) : "No streak yet";
const todayLabel = formatDate(days.at(-1)?.date);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="620" viewBox="0 0 1100 620" role="img" aria-labelledby="title desc">
  <title id="title">GitHub activity dashboard</title>
  <desc id="desc">Custom activity dashboard with contribution summary and chart for ${escapeXml(user.login)}.</desc>
  <defs>
    <linearGradient id="panelBg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#07111f"/>
      <stop offset="100%" stop-color="#0b1729"/>
    </linearGradient>
    <linearGradient id="line" x1="0" x2="1">
      <stop offset="0%" stop-color="#67e8f9"/>
      <stop offset="55%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#22c55e"/>
    </linearGradient>
    <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3.5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <pattern id="grid" width="30" height="24" patternUnits="userSpaceOnUse">
      <path d="M30 0H0V24" fill="none" stroke="#1f3654" stroke-width="1" stroke-dasharray="2 4" opacity=".58"/>
    </pattern>
    <clipPath id="chartClip">
      <rect x="${chart.x}" y="${chart.y}" width="${chart.width}" height="${chart.height}" rx="4"/>
    </clipPath>
  </defs>

  <rect x="8" y="8" width="1084" height="604" rx="24" fill="url(#panelBg)" stroke="#24364f"/>
  <text x="48" y="52" fill="#67e8f9" font-family="Consolas, monospace" font-size="20" font-weight="700">ACTIVITY DASHBOARD</text>
  <text x="820" y="52" fill="#9fb7d4" font-family="Consolas, monospace" font-size="14">${escapeXml(user.login)} · ${year}</text>

  <g transform="translate(212 86)">
    <rect width="676" height="154" rx="16" fill="#101524" stroke="#24364f"/>
    <line x1="225" y1="24" x2="225" y2="130" stroke="#cbd5e1" stroke-width="2" opacity=".72"/>
    <line x1="451" y1="24" x2="451" y2="130" stroke="#cbd5e1" stroke-width="2" opacity=".72"/>
    <text x="112" y="64" text-anchor="middle" fill="#6ea8ff" font-family="Segoe UI, Arial" font-size="34" font-weight="800">${total}</text>
    <text x="112" y="98" text-anchor="middle" fill="#6ea8ff" font-family="Consolas, monospace" font-size="15">Contributions</text>
    <text x="112" y="125" text-anchor="middle" fill="#22e6c3" font-family="Consolas, monospace" font-size="13">${rangeLabel}</text>
    <circle cx="338" cy="67" r="43" fill="none" stroke="#67e8f9" stroke-width="7" filter="url(#softGlow)"/>
    <path d="M338 18c8 10 5 20 0 26-5-6-8-16 0-26z" fill="#67e8f9" filter="url(#softGlow)"/>
    <text x="338" y="78" text-anchor="middle" fill="#c084fc" font-family="Segoe UI, Arial" font-size="31" font-weight="800">${currentStreak.count}</text>
    <text x="338" y="122" text-anchor="middle" fill="#c084fc" font-family="Consolas, monospace" font-size="15" font-weight="700">Current streak</text>
    <text x="564" y="64" text-anchor="middle" fill="#6ea8ff" font-family="Segoe UI, Arial" font-size="34" font-weight="800">${longest.count}</text>
    <text x="564" y="98" text-anchor="middle" fill="#6ea8ff" font-family="Consolas, monospace" font-size="15">Longest streak</text>
    <text x="564" y="125" text-anchor="middle" fill="#22e6c3" font-family="Consolas, monospace" font-size="13">${longestLabel}</text>
  </g>

  <g>
    <rect x="48" y="294" width="1004" height="272" rx="16" fill="#101524" stroke="#24364f"/>
    <text x="550" y="332" text-anchor="middle" fill="#6ea8ff" font-family="Segoe UI, Arial" font-size="18" font-weight="800">Edwin's Contribution Graph</text>
    <rect x="${chart.x}" y="${chart.y}" width="${chart.width}" height="${chart.height}" fill="url(#grid)"/>
    <line x1="${chart.x}" y1="${chart.y + chart.height}" x2="${chart.x + chart.width}" y2="${chart.y + chart.height}" stroke="#6ea8ff" stroke-width="2" opacity=".8"/>
    <line x1="${chart.x}" y1="${chart.y}" x2="${chart.x}" y2="${chart.y + chart.height}" stroke="#6ea8ff" stroke-width="2" opacity=".8"/>
    <text x="78" y="438" text-anchor="middle" transform="rotate(-90 78 438)" fill="#6ea8ff" font-family="Consolas, monospace" font-size="12">Contributions</text>
    <text x="550" y="524" text-anchor="middle" fill="#6ea8ff" font-family="Consolas, monospace" font-size="12">Last 31 days</text>
    <g clip-path="url(#chartClip)">
      <polyline points="${polyline}" fill="none" stroke="url(#line)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#softGlow)"/>
    </g>
    ${circles}
    ${labels}
  </g>

  <g font-family="Consolas, monospace" font-size="16" font-weight="700">
    <text x="338" y="594" fill="#e5eefb">repos publicos: ${repos}</text>
    <text x="526" y="594" fill="#67e8f9">current streak: ${currentStreak.count}</text>
    <text x="734" y="594" fill="#22e6c3">updated: ${todayLabel}</text>
  </g>
</svg>
`;

await import("node:fs/promises").then((fs) => fs.writeFile("assets/activity-panel.svg", svg, "utf8"));

function getCurrentStreak(allDays) {
  let endIndex = allDays.length - 1;
  while (endIndex >= 0 && allDays[endIndex].contributionCount === 0) {
    endIndex -= 1;
  }

  if (endIndex < 0) {
    return { count: 0, start: null, end: null };
  }

  let startIndex = endIndex;
  while (startIndex >= 0 && allDays[startIndex].contributionCount > 0) {
    startIndex -= 1;
  }

  return {
    count: endIndex - startIndex,
    start: allDays[startIndex + 1].date,
    end: allDays[endIndex].date,
  };
}

function getLongestStreak(allDays) {
  let best = { count: 0, start: null, end: null };
  let current = { count: 0, start: null, end: null };

  for (const day of allDays) {
    if (day.contributionCount > 0) {
      current.start ||= day.date;
      current.end = day.date;
      current.count += 1;
      if (current.count > best.count) {
        best = { ...current };
      }
    } else {
      current = { count: 0, start: null, end: null };
    }
  }

  return best;
}

function formatDate(date) {
  if (!date) return "No data";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatRange(start, end) {
  if (!start || !end) return "No data";
  return start === end ? formatDate(start) : `${formatDate(start)} - ${formatDate(end)}`;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function getTodayParts(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year").value),
    month: Number(parts.find((part) => part.type === "month").value),
    day: Number(parts.find((part) => part.type === "day").value),
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
