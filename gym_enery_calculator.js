// ==UserScript==
// @name         Torn Gym Energy Calculator
// @namespace    https://github.com/qaimali7-web
// @version      1.0
// @description  Displays gym energy data as a native-style bar with dual teal accents.
// @author       Qaim [2370947]
// @match        https://www.torn.com/gym.php*
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js
// ==/UserScript==


(function() {
    'use strict';

    function log(msg) { console.log(`[TornGymCalc] ${msg}`); }

    const GYM_ENERGIES = [
        200, 500, 1000, 2000, 2750, 3000, 3500, 4000, 6000, 7000, 8000,
        11000, 12420, 18000, 18100, 24140, 31260, 36610, 46640, 56520, 67775, 84535, 106305
    ];

    let apiKey = GM_getValue('qaim_torn_api_key', '');
    let userData = { perkMultiplier: 1.0, dailyEnergy: 1470, hasMusicStore: false, isLoaded: false };

    const styles = `
        /* The Main Bar */
        .qaim-gym-bar {
            background-color: #222;
            border-left: 6px solid #00bcd4;  /* Left Teal Corner */
            border-right: 6px solid #00bcd4; /* Right Teal Corner */
            border-radius: 5px;
            margin-top: 10px;
            margin-bottom: 10px;
            padding: 0 15px;
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: #fff;
            font-family: 'Arial', sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            position: relative;
            clear: both;
        }

        /* Left Side: Name and Progress */
        .qaim-bar-title {
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #00bcd4;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .qaim-bar-values {
            color: #ddd;
            font-weight: 400;
            font-size: 13px;
        }
        .qaim-highlight { color: #fff; font-weight: bold; }

        /* Right Side: Badges and Time */
        .qaim-bar-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .qaim-badge {
            background: #444; color: #aaa;
            padding: 2px 6px; border-radius: 3px;
            font-size: 10px; text-transform: uppercase;
            border: 1px solid #555;
            cursor: default;
        }
        .qaim-badge.active {
            background: rgba(0, 188, 212, 0.2);
            color: #00bcd4;
            border-color: #00bcd4;
        }
        .qaim-days {
            font-size: 12px; color: #999; font-style: italic;
        }

        /* Settings Icon */
        .qaim-settings-icon {
            cursor: pointer; color: #666; font-size: 16px; margin-left: 5px;
            transition: color 0.2s;
        }
        .qaim-settings-icon:hover { color: #fff; }

        /* Tooltip Input (Non-Intrusive) */
        .qaim-tooltip {
            position: absolute;
            top: 45px; right: 0;
            background: #333;
            border: 1px solid #555;
            padding: 10px;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            z-index: 1000;
            display: none;
            width: 240px;
        }
        .qaim-tooltip::after {
            content: ''; position: absolute; bottom: 100%; right: 10px;
            border-width: 6px; border-style: solid;
            border-color: transparent transparent #333 transparent;
        }
        .qaim-input {
            width: 100%; padding: 5px; margin-bottom: 8px;
            background: #111; border: 1px solid #444;
            color: #fff; font-size: 12px; border-radius: 3px;
            box-sizing: border-box;
        }
        .qaim-save-btn {
            width: 100%; padding: 4px;
            background: #00bcd4; color: #111; border: none;
            font-weight: bold; font-size: 11px; border-radius: 3px;
            cursor: pointer;
        }
        .qaim-save-btn:hover { background: #00acc1; }
    `;

    function injectStyles() {
        if (document.getElementById('qaim-styles')) return;
        const styleSheet = document.createElement("style");
        styleSheet.id = 'qaim-styles';
        styleSheet.type = "text/css";
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);
    }

    function formatNum(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // --- API ---
    function fetchApiData(callback) {
        if (!apiKey) { callback(); return; }
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://api.torn.com/user/?selections=perks,profile,bars&key=${apiKey}`,
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.error) { console.error('Torn API Error:', data.error); return; }

                    let multiplier = 1.0;
                    let musicActive = false;
                    const jobPerks = data.job_perks || [];
                    const musicPerk = jobPerks.find(p => p.toLowerCase().includes('gym') && (p.toLowerCase().includes('gain') || p.toLowerCase().includes('music')));

                    if (musicPerk) { musicActive = true; multiplier = 1.3; }

                    const maxEnergy = data.energy ? data.energy.maximum : 150;
                    const isDonator = data.donator === 1;
                    let dailyE = isDonator ? (24 * 60 / 10) * 5 : (24 * 60 / 15) * 5;
                    dailyE += 750 + maxEnergy;

                    userData = { perkMultiplier: multiplier, dailyEnergy: dailyE, hasMusicStore: musicActive, isLoaded: true };
                    callback();
                } catch (e) { console.error(e); }
            }
        });
    }

    // --- Logic ---
    function init() {
        if ($('#QaimGymBar').length > 0) return;

        const percentageEl = Array.from(document.querySelectorAll('[class*="percentage"]'))
                                  .find(el => el.innerText.includes('%'));
        if (!percentageEl) return;

        const buttonEl = $(percentageEl).closest('button');
        if (!buttonEl.length) return;

        const ariaLabel = buttonEl.attr('aria-label') || "";
        const gymName = ariaLabel.split('.')[0] || "Current Gym";

        let gymId = 0;
        const iconDiv = buttonEl.find('[class*="gym-"]');
        if (iconDiv.length) {
            const match = iconDiv.attr('class').match(/gym-(\d+)/);
            if (match && match[1]) gymId = parseInt(match[1], 10);
        }

        const gymsListContainer = buttonEl.closest('div[class*="gymsList"]');
        const insertTarget = gymsListContainer.length ? gymsListContainer : buttonEl.parent().parent();

        let totalReq = 0;
        if (gymId > 1 && (gymId - 2) < GYM_ENERGIES.length) {
            totalReq = GYM_ENERGIES[gymId - 2];
        }

        injectStyles();

        const barHTML = `
            <div class="qaim-gym-bar" id="QaimGymBar">
                <div class="qaim-bar-title">
                    <span>${gymName}</span>
                    <span class="qaim-bar-values">
                        <span class="qaim-highlight" id="qaim-rem">Loading...</span> / <span id="qaim-tot">...</span> E
                    </span>
                </div>

                <div class="qaim-bar-controls">
                    <div class="qaim-badge" id="qaim-api-badge">API</div>
                    <div class="qaim-badge" id="qaim-music-badge">Music Store</div>
                    <div class="qaim-days" id="qaim-days">...</div>
                    <div class="qaim-settings-icon" id="qaim-settings-trigger" title="Enter API Key">⚙</div>
                </div>

                <div class="qaim-tooltip" id="qaim-tooltip">
                    <div style="margin-bottom:5px; font-size:11px; color:#aaa;">Enter Public API Key:</div>
                    <input type="text" class="qaim-input" id="qaim-api-input" value="${apiKey}" placeholder="Key...">
                    <button class="qaim-save-btn" id="qaim-save-btn">Save</button>
                </div>
            </div>
        `;

        if (insertTarget.length) {
            insertTarget.after(barHTML);
        } else {
            buttonEl.parent().append(barHTML);
        }

        const gymPercentage = parseFloat(percentageEl.innerText.replace("%", ""));

        function updateDisplay() {
            if (totalReq === 0) {
                $('#qaim-rem').text("Specialist");
                $('#qaim-tot').text("N/A");
                return;
            }

            let req = totalReq;
            if (userData.hasMusicStore) req = Math.round(req / userData.perkMultiplier);

            const remaining = Math.max(0, Math.round(req * ((100 - gymPercentage) / 100)));
            const days = (remaining / userData.dailyEnergy).toFixed(1);

            $('#qaim-rem').text(formatNum(remaining));
            $('#qaim-tot').text(formatNum(req));
            $('#qaim-days').text(`~${days} days left`);

            if (apiKey) $('#qaim-api-badge').addClass('active');
            if (userData.hasMusicStore) $('#qaim-music-badge').addClass('active');
        }

        $('#qaim-settings-trigger').on('click', function(e) {
            e.stopPropagation();
            $('#qaim-tooltip').fadeToggle(150);
        });

        $(document).on('click', function(e) {
            if (!$(e.target).closest('#qaim-tooltip, #qaim-settings-trigger').length) {
                $('#qaim-tooltip').fadeOut(150);
            }
        });

        $('#qaim-save-btn').on('click', function() {
            const newKey = $('#qaim-api-input').val().trim();
            GM_setValue('qaim_torn_api_key', newKey);
            location.reload();
        });

        updateDisplay();
        if (apiKey) fetchApiData(updateDisplay);
    }

    const interval = setInterval(() => {
        if ($('button[class*="gymButton"]').length > 0) {
            clearInterval(interval);
            init();
        }
    }, 200);

})();
