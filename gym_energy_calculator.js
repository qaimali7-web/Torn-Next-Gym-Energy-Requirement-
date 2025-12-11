// ==UserScript==
// @name         Torn Gym Energy Calculator
// @namespace    https://github.com/qaimali7-web
// @version      2.0
// @description  Displays gym energy detail.
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

/* globals jQuery, $ */

(function() {
    'use strict';

    function log(msg) { console.log(`[TornGymCalc] ${msg}`); }

    const GYM_ENERGIES = [
        200, 500, 1000, 2000, 2750, 3000, 3500, 4000, 6000, 7000, 8000,
        11000, 12420, 18000, 18100, 24140, 31260, 36610, 46640, 56520, 67775, 84535, 106305
    ];

    let apiKey = GM_getValue('qaim_torn_api_key', '');
    let userData = { perkMultiplier: 1.0, dailyEnergy: 1470, hasMusicStore: false, isLoaded: false };
    
    let lastEnergyVal = -1;
    let localSpentOffset = 0; // Energy spent since last page load/% update

    const styles = `
        .qaim-gym-bar {
            background-color: #222;
            border-left: 6px solid #00bcd4;
            border-right: 6px solid #00bcd4;
            border-radius: 5px;
            margin-top: 10px; margin-bottom: 10px;
            padding: 8px 15px;
            min-height: 38px;
            display: flex; align-items: center; justify-content: space-between;
            color: #fff; font-family: 'Arial', sans-serif; font-size: 13px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            position: relative; clear: both;
        }
        .qaim-stats-container { display: flex; gap: 20px; align-items: center; }
        .qaim-stat-group { display: flex; flex-direction: column; }
        .qaim-label { font-size: 10px; color: #00bcd4; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
        .qaim-value { font-size: 14px; color: #eee; font-weight: 400; transition: color 0.3s; }
        .qaim-value.updated { color: #00bcd4; } /* Flash color on update */
        .qaim-warning { color: #ffca28; font-weight: 600; font-size: 13px; }
        
        .qaim-bar-controls { display: flex; align-items: center; gap: 10px; }
        .qaim-badge {
            background: #444; color: #aaa; padding: 2px 6px; border-radius: 3px;
            font-size: 10px; text-transform: uppercase; border: 1px solid #555; cursor: default;
        }
        .qaim-badge.active { background: rgba(0, 188, 212, 0.2); color: #00bcd4; border-color: #00bcd4; }
        
        .qaim-settings-icon { cursor: pointer; color: #aaa; font-size: 18px; margin-left: 5px; transition: color 0.2s; }
        .qaim-settings-icon:hover { color: #fff; }

        .qaim-tooltip {
            position: absolute; top: 50px; right: 0;
            background: #333; border: 1px solid #555; padding: 10px;
            border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            z-index: 1000; display: none; width: 240px;
        }
        .qaim-input {
            width: 100%; padding: 5px; margin-bottom: 8px;
            background: #111; border: 1px solid #444; color: #fff;
            font-size: 12px; border-radius: 3px; box-sizing: border-box;
        }
        .qaim-save-btn {
            width: 100%; padding: 4px; background: #00bcd4; color: #111;
            border: none; font-weight: bold; font-size: 11px; border-radius: 3px; cursor: pointer;
        }
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

    function init() {
        if ($('#QaimGymBar').length > 0) return;

        // Find hooks
        const percentageEl = Array.from(document.querySelectorAll('[class*="percentage"]')).find(el => el.innerText.includes('%'));
        if (!percentageEl) return;
        const buttonEl = $(percentageEl).closest('button');
        if (!buttonEl.length) return;

        // Extract Gym ID
        let gymId = 0;
        const iconDiv = buttonEl.find('[class*="gym-"]');
        if (iconDiv.length) {
            const match = iconDiv.attr('class').match(/gym-(\d+)/);
            if (match && match[1]) gymId = parseInt(match[1], 10);
        }

        // Determine Total Requirement
        let totalReq = 0;
        if (gymId > 1 && (gymId - 2) < GYM_ENERGIES.length) {
            totalReq = GYM_ENERGIES[gymId - 2];
        }

        injectStyles();

        // Build HTML
        let contentHTML = '';
        let controlsHTML = '';

        if (!apiKey) {
            contentHTML = `<span class="qaim-warning">Enter Public API key & refresh page for details</span>`;
            controlsHTML = `<div class="qaim-settings-icon" id="qaim-settings-trigger" title="Enter API Key">⚙</div>`;
        } else {
            contentHTML = `
                <div class="qaim-stats-container">
                    <div class="qaim-stat-group">
                        <span class="qaim-label">Next Gym Req</span>
                        <span class="qaim-value" id="qaim-req">---</span>
                    </div>
                    <div class="qaim-stat-group">
                        <span class="qaim-label">Spent in Gym</span>
                        <span class="qaim-value" id="qaim-spent">---</span>
                    </div>
                    <div class="qaim-stat-group">
                        <span class="qaim-label">Remaining E</span>
                        <span class="qaim-value" id="qaim-rem">---</span>
                    </div>
                </div>
            `;
            controlsHTML = `
                <div class="qaim-badge" id="qaim-api-badge">API</div>
                <div class="qaim-badge" id="qaim-music-badge">Music Store</div>
                <div class="qaim-settings-icon" id="qaim-settings-trigger" title="Settings">⚙</div>
            `;
        }

        const barHTML = `
            <div class="qaim-gym-bar" id="QaimGymBar">
                ${contentHTML}
                <div class="qaim-bar-controls">${controlsHTML}</div>
                <div class="qaim-tooltip" id="qaim-tooltip">
                    <div style="margin-bottom:5px; font-size:11px; color:#aaa;">Enter Public API Key:</div>
                    <input type="text" class="qaim-input" id="qaim-api-input" value="${apiKey}" placeholder="Key...">
                    <button class="qaim-save-btn" id="qaim-save-btn">Save</button>
                </div>
            </div>
        `;

        // Insert
        const gymsListContainer = buttonEl.closest('div[class*="gymsList"]'); 
        const insertTarget = gymsListContainer.length ? gymsListContainer : buttonEl.parent().parent();
        
        if (insertTarget.length) insertTarget.after(barHTML);
        else buttonEl.parent().append(barHTML);

        // Handlers
        $('#qaim-settings-trigger').off('click').on('click', function(e) { e.stopPropagation(); $('#qaim-tooltip').fadeToggle(150); });
        $(document).off('click.qaim').on('click.qaim', function(e) { if (!$(e.target).closest('#qaim-tooltip, #qaim-settings-trigger').length) $('#qaim-tooltip').fadeOut(150); });
        $('#qaim-save-btn').off('click').on('click', function() { GM_setValue('qaim_torn_api_key', $('#qaim-api-input').val().trim()); location.reload(); });

        // Update Function
        if (apiKey) {
            
            setupEnergyObserver();

            const updateDisplay = () => {
                if (totalReq === 0) {
                    $('#qaim-req').text("N/A");
                    $('#qaim-spent').text("Specialist");
                    $('#qaim-rem').text("Stats Based");
                    return;
                }

                let req = totalReq;
                if (userData.hasMusicStore) req = Math.round(req / userData.perkMultiplier);

                // Read current Percentage from DOM
                const percentageEl = Array.from(document.querySelectorAll('[class*="percentage"]')).find(el => el.innerText.includes('%'));
                const currentPct = percentageEl ? parseFloat(percentageEl.innerText.replace("%", "")) : 0;

                // Base Range Calc from Percentage
                const baseMaxRem = Math.round(req * ((100 - currentPct) / 100));
                const baseMinRem = Math.round(req * ((100 - (currentPct + 1)) / 100));

                const realMinRem = Math.max(0, baseMinRem - localSpentOffset);
                const realMaxRem = Math.max(0, baseMaxRem - localSpentOffset);

                const minSpent = req - realMaxRem;
                const maxSpent = req - realMinRem;

                $('#qaim-req').text(formatNum(req));
                $('#qaim-spent').text(`${formatNum(minSpent)} - ${formatNum(maxSpent)}`);
                $('#qaim-rem').text(`${formatNum(realMinRem)} - ${formatNum(realMaxRem)}`);
                
                // Visual feedback if offset exists
                if (localSpentOffset > 0) $('.qaim-value').addClass('updated');
                else $('.qaim-value').removeClass('updated');

                if (apiKey) $('#qaim-api-badge').addClass('active');
                if (userData.hasMusicStore) $('#qaim-music-badge').addClass('active');
            };

            // Initial call
            updateDisplay();
            fetchApiData(updateDisplay);

            window.qaimUpdateDisplay = updateDisplay;
        }
    }


    function setupEnergyObserver() {

        const sidebar = document.getElementById('sidebarroot') || document.body;
        
        // Helper to extract current energy
        const getEnergy = () => {
            const energyEl = $(sidebar).find('p[class*="bar-value"]').filter((i, el) => $(el).text().includes('/'));
            if (energyEl.length) {
                const txt = energyEl.first().text().split('/')[0];
                return parseInt(txt, 10);
            }
            return -1;
        };

        // Initialize state
        lastEnergyVal = getEnergy();

        // Observer
        const observer = new MutationObserver(() => {
            const currentE = getEnergy();
            if (currentE !== -1 && lastEnergyVal !== -1) {
                if (currentE < lastEnergyVal) {
                    const diff = lastEnergyVal - currentE;
            
                    if (diff > 0 && diff <= 1000) {
                        localSpentOffset += diff;
                        log(`Detected training! Spent ${diff}E. Total local offset: ${localSpentOffset}`);
                        if (window.qaimUpdateDisplay) window.qaimUpdateDisplay();
                    }
                } else if (currentE > lastEnergyVal) {
                 
                }
            }
            lastEnergyVal = currentE;
        });

        observer.observe(sidebar, { childList: true, subtree: true, characterData: true });
    }

    // --- Persistent Polling ---
    setInterval(() => {
        if ($('button[class*="gymButton"]').length > 0) {
            if ($('#QaimGymBar').length === 0) {
                localSpentOffset = 0; 
                init();
            }
        }
    }, 500);

})();
