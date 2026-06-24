(() => {
  const {
    api,
    escapeHtml,
    formatClock,
    secondsRemaining,
    teamById,
    playerById,
    currentPick
  } = DraftApp;

  const $ = id => document.getElementById(id);

  let password = "";
  let snapshot = null;
  let step = 1;
  let rounds = 1;

  // Used to detect when a team submits a new pick.
  let knownCompletedPickCount = null;
  let pendingPickAnnouncement = null;

  function showMessage(text, type = "success") {
    const el = $("message");
    el.textContent = text;
    el.className = `message ${type === "error" ? "error" : ""}`;

    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => {
      el.classList.add("hidden");
    }, 4000);
  }

  function showLoginError(text) {
    $("loginMessage").textContent = text;
    $("loginMessage").classList.remove("hidden");
  }

  async function run(action, successText) {
    try {
      const result = await action();

      if (successText) {
        showMessage(
          typeof successText === "function"
            ? successText(result)
            : successText
        );
      }

      await refresh();
      return result;
    } catch (error) {
      showMessage(error.message || String(error), "error");
      return null;
    }
  }

  function chooseStartingStep() {
    if (snapshot.picks.length) return 4;
    if (snapshot.teams.length) return 3;
    if (snapshot.players.length) return 2;
    return 1;
  }

  function goStep(number) {
    step = Number(number);

    document
      .querySelectorAll(".wizard-step")
      .forEach(el => el.classList.add("hidden"));

    $(`step${step}`).classList.remove("hidden");

    document.querySelectorAll(".step-dot").forEach((button, index) => {
      button.classList.toggle("active", index + 1 === step);
      button.classList.toggle("done", index + 1 < step);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function ordinal(number) {
    const value = Number(number);
    const lastTwoDigits = value % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
      return `${value}th`;
    }

    switch (value % 10) {
      case 1:
        return `${value}st`;
      case 2:
        return `${value}nd`;
      case 3:
        return `${value}rd`;
      default:
        return `${value}th`;
    }
  }

  function hidePickDisplayBanner() {
    $("pickDisplayBanner").classList.add("hidden");
    pendingPickAnnouncement = null;
  }

  function showPickDisplayBanner(draftSnapshot, draftPick) {
    const team = teamById(draftSnapshot, draftPick.team_id);
    const player = playerById(draftSnapshot, draftPick.player_id);

    if (!team || !player) return;

    pendingPickAnnouncement = {
      pickNumber: Number(draftPick.pick_number),
      teamName: team.name,
      playerName: player.name
    };

    $("pickDisplayBannerMessage").textContent =
      `${team.name} selected ${player.name}. ` +
      "Do you want to show this pick on the display?";

    $("pickDisplayBanner").classList.remove("hidden");
  }

  function detectNewPick(nextSnapshot) {
    const completedPicks = nextSnapshot.picks.filter(
      draftPick => draftPick.player_id
    );

    // Do not show banners for picks that already existed when the
    // commissioner first opened or refreshed the page.
    if (knownCompletedPickCount === null) {
      knownCompletedPickCount = completedPicks.length;
      return;
    }

    if (completedPicks.length > knownCompletedPickCount) {
      const newestPick = completedPicks[completedPicks.length - 1];
      showPickDisplayBanner(nextSnapshot, newestPick);
    }

    // This also handles an undone pick by lowering the known count.
    knownCompletedPickCount = completedPicks.length;
  }

  async function refresh() {
    const nextSnapshot = await api.getSnapshot();

    detectNewPick(nextSnapshot);

    snapshot = nextSnapshot;
    render();
  }

  function renderPlayers() {
    $("playerList").innerHTML = snapshot.players.length
      ? snapshot.players.map(player => `
        <div class="list-row">
          <div>
            <div class="list-name">🏀 ${escapeHtml(player.name)}</div>
            <div class="list-note">
              ${player.drafted ? "Already picked" : "Ready to be picked"}
            </div>
          </div>

          <button
            class="mini-button delete"
            data-delete-player="${player.id}"
            ${player.drafted ? "disabled" : ""}
          >
            🗑️
          </button>
        </div>
      `).join("")
      : `
        <div class="empty">
          No players yet. Add the first one above.
        </div>
      `;

    $("playersNext").disabled = snapshot.players.length < 1;

    document.querySelectorAll("[data-delete-player]").forEach(button => {
      button.onclick = () => {
        run(
          () => api.deletePlayer(
            password,
            Number(button.dataset.deletePlayer)
          ),
          "Player deleted."
        );
      };
    });
  }

  function renderTeams() {
    const teams = [...snapshot.teams].sort(
      (a, b) => a.display_order - b.display_order
    );

    const html = teams.length
      ? teams.map((team, index) => `
        <div class="list-row">
          <div>
            <div class="list-name">
              ${index + 1}. ${escapeHtml(team.name)}
            </div>

            <div class="list-note">
              Team password is in the Password Room.
            </div>
          </div>

          <div class="row-buttons">
            <button
              class="mini-button"
              data-move-team="up"
              data-id="${team.id}"
              ${index === 0 ? "disabled" : ""}
            >
              ⬆️
            </button>

            <button
              class="mini-button"
              data-move-team="down"
              data-id="${team.id}"
              ${index === teams.length - 1 ? "disabled" : ""}
            >
              ⬇️
            </button>

            <button
              class="mini-button delete"
              data-delete-team="${team.id}"
            >
              🗑️
            </button>
          </div>
        </div>
      `).join("")
      : `
        <div class="empty">
          No teams yet. Add the first one above.
        </div>
      `;

    $("teamList").innerHTML = html;
    $("orderList").innerHTML = html;
    $("teamsNext").disabled = teams.length < 1;

    document.querySelectorAll("[data-move-team]").forEach(button => {
      button.onclick = () => {
        run(() => api.moveTeam(
          password,
          Number(button.dataset.id),
          button.dataset.moveTeam
        ));
      };
    });

    document.querySelectorAll("[data-delete-team]").forEach(button => {
      button.onclick = () => {
        if (confirm("Delete this team?")) {
          run(
            () => api.deleteTeam(
              password,
              Number(button.dataset.deleteTeam)
            ),
            "Team deleted."
          );
        }
      };
    });
  }

  function renderDraft() {
    const pick = currentPick(snapshot);
    const team = pick ? teamById(snapshot, pick.team_id) : null;
    const status = snapshot.settings.status;
    const hasOrder = snapshot.picks.length > 0;

    $("pickLabel").textContent = pick
      ? `ROUND ${pick.round_number} • PICK ${pick.pick_number}`
      : "NO ORDER YET";

    $("currentTeam").textContent = status === "complete"
      ? "Draft Complete! 🎉"
      : (team?.name || "Make the order first");

    $("timer").textContent = formatClock(
      secondsRemaining(snapshot.settings)
    );

    const labels = {
      setup: "MAKE THE ORDER",
      waiting: "WAITING FOR START",
      live: "ON THE CLOCK",
      paused: "PAUSED",
      complete: "FINISHED"
    };

    $("statusPill").textContent = labels[status] || "WAITING";

    $("startPick").classList.toggle(
      "hidden",
      status === "live" || status === "complete"
    );

    $("startPick").disabled =
      !hasOrder || status === "complete";

    $("startPick").textContent = status === "paused"
      ? "▶️ CONTINUE THIS TEAM"
      : `▶️ START ${team?.name || "THIS TEAM"}`;

    $("pausePick").classList.toggle("hidden", status !== "live");

    $("resetTimer").classList.toggle(
      "hidden",
      !(status === "live" || status === "paused")
    );

    const available = snapshot.players.filter(
      player => !player.drafted
    );

    $("adminPlayerSelect").innerHTML = available.length
      ? `
        <option value="">Choose a player</option>
        ${available.map(player => `
          <option value="${player.id}">
            ${escapeHtml(player.name)}
          </option>
        `).join("")}
      `
      : `<option value="">No players left</option>`;

    $("adminMakePick").disabled =
      status !== "live" || !available.length;

    $("displayMessage").value =
      snapshot.settings.display_message || "";

    $("draftBoard").innerHTML = snapshot.picks.length
      ? snapshot.picks.map(draftPick => {
          const draftTeam = teamById(snapshot, draftPick.team_id);

          const draftedPlayer = draftPick.player_id
            ? playerById(snapshot, draftPick.player_id)
            : null;

          const isCurrent =
            Number(draftPick.pick_number) ===
              Number(snapshot.settings.current_pick_number) &&
            !draftPick.player_id;

          return `
            <div class="board-row ${isCurrent ? "current" : ""}">
              <div class="board-number">
                #${draftPick.pick_number}
              </div>

              <div class="board-team">
                ${escapeHtml(draftTeam?.name || "Team")}
              </div>

              <div class="board-player">
                ${
                  draftedPlayer
                    ? `✅ ${escapeHtml(draftedPlayer.name)}`
                    : isCurrent
                      ? "👉 Next"
                      : "Waiting"
                }
              </div>
            </div>
          `;
        }).join("")
      : `
        <div class="empty">
          Go to Step 3 and make the draft order.
        </div>
      `;

    $("orderNext").disabled = !snapshot.picks.length;
  }

  function render() {
    renderPlayers();
    renderTeams();
    renderDraft();
    $("roundNumber").textContent = rounds;
  }

  async function login() {
    const value = $("commissionerLogin").value.trim();

    if (!value) {
      return showLoginError("Type the commissioner password.");
    }

    try {
      const good = await api.validateCommissionerPassword(value);

      if (!good) {
        return showLoginError("Wrong commissioner password.");
      }

      password = value;

      sessionStorage.setItem(
        "draft-commissioner-password",
        value
      );

      $("loginScreen").classList.add("hidden");
      $("commissionerApp").classList.remove("hidden");

      await refresh();
      goStep(chooseStartingStep());
    } catch (error) {
      showLoginError(error.message || String(error));
    }
  }

  $("commissionerLoginButton").onclick = login;

  $("commissionerLogin").addEventListener("keydown", event => {
    if (event.key === "Enter") login();
  });

  document.querySelectorAll("[data-go-step]").forEach(button => {
    button.onclick = () => goStep(button.dataset.goStep);
  });

  $("addPlayer").onclick = () => {
    const name = $("playerName").value.trim();

    if (!name) {
      return showMessage("Type a player name.", "error");
    }

    run(async () => {
      await api.addPlayer(password, name);
      $("playerName").value = "";
    }, "Player added!");
  };

  $("playerName").addEventListener("keydown", event => {
    if (event.key === "Enter") $("addPlayer").click();
  });

  $("playersNext").onclick = () => goStep(2);

  $("addTeam").onclick = async () => {
    const name = $("teamName").value.trim();

    if (!name) {
      return showMessage("Type a team name.", "error");
    }

    const result = await run(async () => {
      const added = await api.addTeam(password, name);
      $("teamName").value = "";
      return added;
    });

    if (result) {
      const code =
        result.code ||
        result.access_code ||
        "Set it in Passwords";

      $("newTeamCode").innerHTML =
        `✅ <strong>${escapeHtml(name)}</strong> password: ` +
        `<strong>${escapeHtml(code)}</strong>`;

      $("newTeamCode").classList.remove("hidden");
    }
  };

  $("teamName").addEventListener("keydown", event => {
    if (event.key === "Enter") $("addTeam").click();
  });

  $("teamsNext").onclick = () => goStep(3);

  $("roundMinus").onclick = () => {
    rounds = Math.max(1, rounds - 1);
    $("roundNumber").textContent = rounds;
  };

  $("roundPlus").onclick = () => {
    rounds = Math.min(20, rounds + 1);
    $("roundNumber").textContent = rounds;
  };

  $("makeOrder").onclick = () => {
    run(
      () => api.generateOrder(password, rounds),
      "Draft order made!"
    );
  };

  $("orderNext").onclick = () => goStep(4);

  $("startPick").onclick = () => {
    if (snapshot.settings.status === "paused") {
      run(
        () => api.resumePick(password),
        "Pick continued!"
      );
    } else {
      run(
        () => api.startPick(password),
        "This team can pick now!"
      );
    }
  };

  $("pausePick").onclick = () => {
    run(
      () => api.pausePick(password),
      "Pick paused."
    );
  };

  $("resetTimer").onclick = () => {
    run(
      () => api.resetTimer(password),
      "Clock restarted."
    );
  };

  $("adminMakePick").onclick = () => {
    const playerId = Number($("adminPlayerSelect").value);

    if (!playerId) {
      return showMessage("Choose a player.", "error");
    }

    run(
      () => api.makeAdminPick(password, playerId),
      "Pick saved! Start the next team when ready."
    );
  };

  $("undoPick").onclick = () => {
    if (confirm("Undo the last pick?")) {
      hidePickDisplayBanner();

      run(
        () => api.undoLastPick(password),
        "Last pick undone."
      );
    }
  };

  $("showMessage").onclick = () => {
    const text = $("displayMessage").value.trim();

    if (!text) {
      return showMessage("Type a message first.", "error");
    }

    run(
      () => api.setDisplayMessage(password, text),
      "Message is showing on the display!"
    );
  };

  $("clearMessage").onclick = () => {
    run(
      () => api.clearDisplayMessage(password),
      "Display message cleared."
    );
  };

  $("displayNewPick").onclick = async () => {
    if (!pendingPickAnnouncement) return;

    const announcement =
      `With the ${ordinal(pendingPickAnnouncement.pickNumber)} pick ` +
      `in the Draft,\n` +
      `the ${pendingPickAnnouncement.teamName} select\n` +
      `${pendingPickAnnouncement.playerName}.`;

    const result = await run(
      () => api.setDisplayMessage(password, announcement),
      "The pick is now showing on the display!"
    );

    if (result !== null) {
      hidePickDisplayBanner();
    }
  };

  $("skipNewPickDisplay").onclick = () => {
    hidePickDisplayBanner();
  };

  if (api.configured) {
    $("firstTimeNote").classList.add("hidden");
  }

  const saved = sessionStorage.getItem(
    "draft-commissioner-password"
  );

  if (saved) {
    $("commissionerLogin").value = saved;
    login();
  }

  api.subscribe(async () => {
    if (!password) return;
    await refresh();
  });

  setInterval(() => {
    if (
      snapshot &&
      !$("step4").classList.contains("hidden")
    ) {
      $("timer").textContent = formatClock(
        secondsRemaining(snapshot.settings)
      );
    }
  }, 500);
})();
