(() => {
  const { api, formatClock, secondsRemaining, teamById, playerById, currentPick } = DraftApp;
  const $ = id => document.getElementById(id);
  let snapshot = null;

  function showLoginError(text) {
    $("loginMessage").textContent = text;
    $("loginMessage").classList.remove("hidden");
  }

  async function login() {
    const password = $("displayLogin").value.trim();
    if (!password) return showLoginError("Type the display password.");
    try {
      const good = await api.validateDisplayPassword(password);
      if (!good) return showLoginError("Wrong display password.");
      sessionStorage.setItem("draft-display-password", password);
      $("loginScreen").classList.add("hidden");
      $("displayApp").classList.remove("hidden");
      await refresh();
    } catch (error) {
      showLoginError(error.message || String(error));
    }
  }

  async function refresh() {
    snapshot = await api.getSnapshot();
    render();
  }

  function setScreen({ emoji, kicker, main, sub, showTime = false, footer = "", custom = false }) {
    $("displayEmoji").textContent = emoji;
    $("displayKicker").textContent = kicker;
    $("displayMain").textContent = main;
    $("displayMain").classList.toggle("custom-message", custom);
    $("displaySub").textContent = sub;
    $("displaySub").classList.toggle("hidden", !sub);
    $("displayTime").classList.toggle("hidden", !showTime);
    $("displayTime").textContent = snapshot ? formatClock(secondsRemaining(snapshot.settings)) : "00:00";
    $("displayFooter").textContent = footer;
  }

  function render() {
    if (!snapshot) return;
    const settings = snapshot.settings;
    const pick = currentPick(snapshot);
    const team = pick ? teamById(snapshot, pick.team_id) : null;
    const completed = snapshot.picks.filter(p => p.player_id);
    const lastPick = completed[completed.length - 1];
    const lastPlayer = lastPick ? playerById(snapshot, lastPick.player_id) : null;
    const lastTeam = lastPick ? teamById(snapshot, lastPick.team_id) : null;
    const footer = lastPick ? `Last pick: ${lastTeam?.name || "Team"} selected ${lastPlayer?.name || "Player"}` : "";

    if (settings.display_message_on && settings.display_message) {
      setScreen({ emoji: "📣", kicker: "Message", main: settings.display_message, sub: "", footer: "", custom: true });
      return;
    }

    if (!snapshot.picks.length || settings.status === "setup") {
      setScreen({ emoji: "🏀", kicker: settings.draft_name || "Basketball Draft", main: "Waiting To Start", sub: "The commissioner is setting up the draft." });
    } else if (settings.status === "waiting") {
      setScreen({ emoji: "⏳", kicker: `Round ${pick?.round_number || 1} • Pick ${pick?.pick_number || 1}`, main: team?.name || "Next Team", sub: "WAITING FOR THE COMMISSIONER TO PRESS START", footer });
    } else if (settings.status === "live") {
      setScreen({ emoji: "🏀", kicker: `Round ${pick?.round_number || 1} • Pick ${pick?.pick_number || 1}`, main: team?.name || "Team", sub: "IS ON THE CLOCK", showTime: true, footer });
    } else if (settings.status === "paused") {
      setScreen({ emoji: "⏸️", kicker: `Round ${pick?.round_number || 1} • Pick ${pick?.pick_number || 1}`, main: team?.name || "Team", sub: "PICK PAUSED", showTime: true, footer });
    } else if (settings.status === "complete") {
      setScreen({ emoji: "🎉", kicker: settings.draft_name || "Basketball Draft", main: "Draft Complete!", sub: "Thank you!", footer });
    }
  }

  $("displayLoginButton").onclick = login;
  $("displayLogin").addEventListener("keydown", event => { if (event.key === "Enter") login(); });
  if (api.configured) $("firstTimeNote").classList.add("hidden");

  const saved = sessionStorage.getItem("draft-display-password");
  if (saved) {
    $("displayLogin").value = saved;
    login();
  }

  api.subscribe(async () => {
    if (!$("displayApp").classList.contains("hidden")) await refresh();
  });

  setInterval(() => {
    if (snapshot && snapshot.settings.status === "live") {
      $("displayTime").textContent = formatClock(secondsRemaining(snapshot.settings));
    }
  }, 500);
})();
