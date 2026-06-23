(() => {
  const { api, escapeHtml, formatClock, secondsRemaining, teamById, playerById, currentPick } = DraftApp;
  const $ = id => document.getElementById(id);
  let snapshot = null;
  let teamId = null;
  let teamPassword = "";
  let selectedPlayerId = null;

  function showMessage(text, type = "success") {
    const el = $("message");
    el.textContent = text;
    el.className = `message ${type === "error" ? "error" : ""}`;
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => el.classList.add("hidden"), 4000);
  }

  function showLoginError(text) {
    $("loginMessage").textContent = text;
    $("loginMessage").classList.remove("hidden");
  }

  async function loadTeams() {
    snapshot = await api.getSnapshot();
    const teams = [...snapshot.teams].sort((a, b) => a.display_order - b.display_order);
    $("teamSelect").innerHTML = teams.length
      ? `<option value="">Choose your team</option>` + teams.map(team => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join("")
      : `<option value="">No teams have been added</option>`;
  }

  async function login() {
    const id = Number($("teamSelect").value);
    const code = $("teamPassword").value.trim();
    if (!id) return showLoginError("Choose your team.");
    if (!code) return showLoginError("Type your team password.");
    try {
      const good = await api.validateTeamPassword(id, code);
      if (!good) return showLoginError("Wrong team password.");
      teamId = id;
      teamPassword = code;
      sessionStorage.setItem("draft-team-id", String(id));
      sessionStorage.setItem("draft-team-password", code);
      $("loginScreen").classList.add("hidden");
      $("teamApp").classList.remove("hidden");
      await refresh();
    } catch (error) {
      showLoginError(error.message || String(error));
    }
  }

  async function refresh() {
    snapshot = await api.getSnapshot();
    render();
  }

  function render() {
    if (!snapshot || !teamId) return;
    const myTeam = teamById(snapshot, teamId);
    const pick = currentPick(snapshot);
    const currentTeam = pick ? teamById(snapshot, pick.team_id) : null;
    const status = snapshot.settings.status;
    const myTurn = status === "live" && Number(pick?.team_id) === Number(teamId);

    $("teamTitle").textContent = `🏀 ${myTeam?.name || "Team"}`;
    $("teamPickLabel").textContent = pick ? `ROUND ${pick.round_number} • PICK ${pick.pick_number}` : "WAITING";
    $("teamTimer").textContent = formatClock(secondsRemaining(snapshot.settings));

    if (status === "complete") {
      $("teamClockName").textContent = "Draft Complete! 🎉";
      $("teamStatus").textContent = "FINISHED";
    } else if (myTurn) {
      $("teamClockName").textContent = "YOUR TURN!";
      $("teamStatus").textContent = "PICK A PLAYER";
    } else if (status === "waiting" && Number(pick?.team_id) === Number(teamId)) {
      $("teamClockName").textContent = "You Are Next";
      $("teamStatus").textContent = "WAIT FOR START";
    } else if (status === "paused" && Number(pick?.team_id) === Number(teamId)) {
      $("teamClockName").textContent = "Your Pick Is Paused";
      $("teamStatus").textContent = "PAUSED";
    } else {
      $("teamClockName").textContent = currentTeam ? `${currentTeam.name} Is Picking` : "Please Wait";
      $("teamStatus").textContent = status === "live" ? "NOT YOUR TURN" : "WAITING";
    }

    $("pickArea").classList.toggle("hidden", !myTurn);
    const available = snapshot.players.filter(player => !player.drafted);
    $("playerButtons").innerHTML = available.length
      ? available.map(player => `<button class="player-button ${Number(selectedPlayerId) === Number(player.id) ? "selected" : ""}" data-player="${player.id}">${escapeHtml(player.name)}</button>`).join("")
      : `<div class="empty">No players are left.</div>`;

    document.querySelectorAll("[data-player]").forEach(button => {
      button.onclick = () => {
        selectedPlayerId = Number(button.dataset.player);
        render();
      };
    });
    $("confirmPick").disabled = !myTurn || !selectedPlayerId;
    const selected = snapshot.players.find(player => Number(player.id) === Number(selectedPlayerId));
    $("confirmPick").textContent = selected ? `✅ PICK ${selected.name.toUpperCase()}` : "✅ YES, PICK THIS PLAYER";

    const completed = snapshot.picks.filter(p => p.player_id);
    $("pickedList").innerHTML = completed.length
      ? completed.map(p => {
          const team = teamById(snapshot, p.team_id);
          const player = playerById(snapshot, p.player_id);
          return `<div class="list-row"><div><div class="list-name">#${p.pick_number} ${escapeHtml(player?.name || "Player")}</div><div class="list-note">${escapeHtml(team?.name || "Team")}</div></div>✅</div>`;
        }).join("")
      : `<div class="empty">No players have been picked yet.</div>`;
  }

  $("teamLoginButton").onclick = login;
  $("teamPassword").addEventListener("keydown", event => { if (event.key === "Enter") login(); });
  $("teamLogout").onclick = () => {
    sessionStorage.removeItem("draft-team-id");
    sessionStorage.removeItem("draft-team-password");
    location.reload();
  };

  $("confirmPick").onclick = async () => {
    if (!selectedPlayerId) return;
    const player = snapshot.players.find(item => Number(item.id) === Number(selectedPlayerId));
    if (!confirm(`Pick ${player?.name || "this player"}?`)) return;
    try {
      await api.teamMakePick(teamId, teamPassword, selectedPlayerId);
      selectedPlayerId = null;
      showMessage("Pick saved! The next team must wait for the commissioner to press START.");
      await refresh();
    } catch (error) {
      showMessage(error.message || String(error), "error");
      await refresh();
    }
  };

  api.subscribe(async () => {
    if (teamId) await refresh();
    else await loadTeams();
  });

  setInterval(() => {
    if (snapshot && teamId) $("teamTimer").textContent = formatClock(secondsRemaining(snapshot.settings));
  }, 500);

  loadTeams().then(async () => {
    const savedId = Number(sessionStorage.getItem("draft-team-id"));
    const savedPassword = sessionStorage.getItem("draft-team-password");
    if (savedId && savedPassword) {
      $("teamSelect").value = String(savedId);
      $("teamPassword").value = savedPassword;
      await login();
    }
  }).catch(error => showLoginError(error.message || String(error)));
})();
