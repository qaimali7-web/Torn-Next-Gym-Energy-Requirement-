// ==UserScript==
// @name         Torn Gym Energy Calculator
// @namespace    https://github.com/qaimali7-web
// @version      1.0.0
// @description  Estimates the energy required to unlock the next gym tier on Torn.com.
// @author       Qaim [2370947]
// @match        https://www.torn.com/gym.php*
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @supportURL   https://github.com/qaimali7-web/Torn-Next-Gym-Energy-Requirement-/issues
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js
// ==/UserScript==

/* globals jQuery, $ */

(function() {
    'use strict';

    // --- Configuration ---
    // Energy required to unlock the NEXT gym.
    // Index 0 = Gym 1 (Premier Fitness) unlocking Gym 2.
    const gymEnergies = [200, 500, 1000, 2000, 2750, 3000, 3500, 4000, 6000, 7000, 8000, 11000, 12420, 18000, 18100, 24140, 31260, 36610, 46640, 56520, 67775, 84535, 106305];
    
    const STORAGE_KEY = 'qaim_music_store_toggle';

    // --- CSS Styles ---
    const styles = `
        .qaim-gym-card {
            background: linear-gradient(135deg, #2a2a2a 0%, #222 100%);
            border-left: 5px solid #00bcd4;
            border-radius: 8px;
            padding: 12px 16px;
            margin: 15px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 8px rgba(0,0,0,0.4);
            font-family: 'Arial', sans-serif;
            color: #e0e0e0;
            box-sizing: border-box;
        }
        .qaim-gym-info { display: flex; flex-direction: column; }
        .qaim-label {
            font-size: 10px; text-transform: uppercase; color: #999;
            letter-spacing: 0.8px; margin-bottom: 4px; font-weight: 700;
        }
        .qaim-values { font-size: 16px; font-weight: 400; }
        .qaim-highlight { color: #fff; font-weight: 700; }
        .qaim-total { color: #00bcd4; font-weight: 700; }
        .qaim-controls { text-align: right; display: flex; flex-direction: column; align-items: flex-end; }
        .qaim-btn {
            background: #383838; border: 1px solid #555; color: #b0b0b0;
            padding: 5px 10px; border-radius: 4px; font-size: 11px;
            cursor: pointer; transition: all 0.2s ease; outline: none;
        }
        .qaim-btn:hover { background: #444; color: #fff; border-color: #777; }
        .qaim-btn.active {
            background: #2e7d32; color: #fff; border-color: #1b5e20;
            box-shadow: 0 0 5px rgba(46, 125, 50, 0.5);
        }
        .qaim-days { font-size: 11px; color: #777; margin-top: 5px; font-style: italic; }
    `;

    // --- Helpers ---
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

    function calculateDays(energy) {
        // Daily E Estimate: 720 (Natural) + 750 (3x Xanax) + 150 (Refill) = ~1620
        // Keeping conservative at ~1500 for calculation
        return Math.ceil(energy / 1500);
    }

    // --- Main Logic ---
    function init() {
        // Prevent duplicate injection
        if ($('#QaimEnergyDashboard').length > 0) return;

        // Locate the percentage bar (The anchor for our logic)
        const percentageEl = Array.from(document.querySelectorAll('div[class^="percentage"]')).find(el => el.innerText.includes('%'));
        
        if (!percentageEl) return;

        // Traverse DOM to find Gym ID (gym-XX)
        // Structure usually: button > div > div > div.percentage
        const buttonContainer = $(percentageEl).closest('li[id^="gym-"]');
        if (!buttonContainer.length) return;

        const gymIdStr = buttonContainer.attr('id'); // e.g., "gym-20"
        const gymNum = parseInt(gymIdStr.replace("gym-", ""), 10);

        // Safety: If Gym is < 2 (tutorial) or > supported list (Specialist), abort
        if (isNaN(gymNum) || gymNum < 2 || (gymNum - 2) >= gymEnergies.length) return;

        injectStyles();

        // State
        let musicStore = (localStorage.getItem(STORAGE_KEY) === 'true');
        const gymPercentage = parseFloat(percentageEl.innerText.replace("%", ""));

        // Render Dashboard
        const dashboard = $(`
            <div class="qaim-gym-card" id="QaimEnergyDashboard">
                <div class="qaim-gym-info">
                    <div class="qaim-label">Progress to Next Gym</div>
                    <div class="qaim-values">
                        <span class="qaim-highlight" id="qaim-rem">---</span>E
                        <span style="color:#555; margin:0 4px;">/</span>
                        <span class="qaim-total" id="qaim-tot">---</span>E
                    </div>
                </div>
                <div class="qaim-controls">
                    <button id="qaim-music-btn" class="qaim-btn">Music Store: OFF</button>
                    <div class="qaim-days" id="qaim-days">~0 days</div>
                </div>
            </div>
        `);

        // Find the container to append to (The 'properties' list inside the gym box)
        const targetContainer = buttonContainer.find('ul.properties').parent();
        if (targetContainer.length) {
            targetContainer.append(dashboard);
        } else {
            // Fallback
            buttonContainer.append(dashboard);
        }

        // Logic Function
        function updateUI() {
            let totalReq = gymEnergies[gymNum - 2];
            
            if (musicStore) {
                // 30% bonus = divide by 1.3
                totalReq = Math.round(totalReq / 1.3);
            }

            const remaining = Math.max(0, Math.round(totalReq * ((100 - gymPercentage) / 100)));
            const days = calculateDays(remaining);

            $('#qaim-rem').text(formatNum(remaining));
            $('#qaim-tot').text(formatNum(totalReq));
            $('#qaim-days').text(`~${days} days left`);
            
            const btn = $('#qaim-music-btn');
            if (musicStore) {
                btn.addClass('active').text('Music Store: ON');
                btn.attr('title', '30% Gym Gains Applied');
            } else {
                btn.removeClass('active').text('Music Store: OFF');
                btn.attr('title', 'Click to enable 30% Gym Gains (Music Store)');
            }
        }

        // Bind Events
        $('#qaim-music-btn').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation(); // Stop click from opening gym details
            musicStore = !musicStore;
            localStorage.setItem(STORAGE_KEY, musicStore);
            updateUI();
        });

        // Initial Run
        updateUI();
    }

    // --- Polling Loader (Better than setTimeout) ---
    // Checks for the existence of the gym list every 200ms, stops after 10s
    let attempts = 0;
    const interval = setInterval(() => {
        if ($('li[id^="gym-"]').length > 0) {
            clearInterval(interval);
            init();
        }
        attempts++;
        if (attempts > 50) clearInterval(interval); // Give up after 10s
    }, 200);

})();
