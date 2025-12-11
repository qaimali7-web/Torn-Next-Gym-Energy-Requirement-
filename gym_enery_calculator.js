// ==UserScript==
// @name         Torn Gym Energy Calculator
// @namespace    https://github.com/qaimali7-web
// @version      1.0
// @description  Estimates energy required to unlock the next gym using your real stats and perks from the Torn API.
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

    // --- Configuration ---
    const GYM_ENERGIES = [200, 500, 1000, 2000, 2750, 3000, 3500, 4000, 6000, 7000, 8000, 11000, 12420, 18000, 18100, 24140, 31260, 36610, 46640, 56520, 67775, 84535, 106305];
    
    // --- State ---
    let apiKey = GM_getValue('qaim_torn_api_key', '');
    let promptViewed = GM_getValue('qaim_api_prompt_viewed', false);

    let userData = {
        perkMultiplier: 1.0,  // Base 100%
        dailyEnergy: 1470,    // Default fallback
        hasMusicStore: false,
        isLoaded: false
    };

    // --- CSS Styles ---
    const styles = `
        .qaim-gym-card {
            background: linear-gradient(135deg, #1e1e1e 0%, #141414 100%);
            border-left: 5px solid #00bcd4;
            border-radius: 8px;
            padding: 12px 16px;
            margin: 15px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.5);
            font-family: 'Arial', sans-serif;
            color: #e0e0e0;
            position: relative;
        }
        .qaim-gym-info { display: flex; flex-direction: column; }
        .qaim-label {
            font-size: 10px; text-transform: uppercase; color: #00bcd4;
            letter-spacing: 1px; margin-bottom: 5px; font-weight: 700;
        }
        .qaim-values { font-size: 18px; font-weight: 400; color: #fff; }
        .qaim-subtext { font-size: 12px; color: #888; margin-left: 5px; }
        .qaim-controls { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .qaim-badge {
            background: #333; color: #aaa; padding: 2px 6px;
            border-radius: 4px; font-size: 10px; border: 1px solid #444;
            cursor: default;
        }
        .qaim-badge.active {
            background: rgba(0, 188, 212, 0.15); color: #00bcd4; border-color: #00bcd4;
        }
        .qaim-days { font-size: 11px; color: #999; font-style: italic; margin-top: 2px; }
        
        /* Settings Button */
        .qaim-settings-btn {
            position: absolute; top: 8px; right: 8px;
            color: #444; cursor: pointer; font-size: 14px;
            transition: color 0.2s;
        }
        .qaim-settings-btn:hover { color: #fff; }

        /* API Modal */
        .qaim-modal {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #222; border: 1px solid #444; padding: 20px;
            z-index: 99999; border-radius: 8px; box-shadow: 0 0 20px rgba(0,0,0,0.8);
            text-align: center; width: 300px; display: none;
        }
        .qaim-input {
            width: 100%; padding: 8px; margin: 10px 0;
            background: #111; border: 1px solid #333; color: #fff;
            border-radius: 4px; box-sizing: border-box;
        }
        .qaim-save-btn {
            background: #00bcd4; color: #000; border: none;
            padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer;
        }
        .qaim-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 99998; display: none;
        }
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

    // --- API Logic ---
    function fetchApiData(callback) {
        if (!apiKey) {
            callback(); 
            return;
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: `https://api.torn.com/user/?selections=perks,profile,bars&key=${apiKey}`,
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.error) {
                        console.error('Torn API Error:', data.error);
                        alert(`API Error: ${data.error.error}`);
                        return;
                    }
                    
                    // 1. Check Music Store (Job Perk)
                    let multiplier = 1.0;
                    let musicActive = false;
                    const jobPerks = data.job_perks || [];
                    const musicPerk = jobPerks.find(p => p.toLowerCase().includes('gym') && (p.toLowerCase().includes('gain') || p.toLowerCase().includes('music')));
                    
                    if (musicPerk) {
                        musicActive = true;
                        multiplier = 1.3; // 30% boost
                    }

                    // 2. Calculate Daily Energy
                    const maxEnergy = data.energy ? data.energy.maximum : 150;
                    const isDonator = data.donator === 1;
                    let dailyE = 0;
                    
                    // Natural Regen
                    if (isDonator) {
                        dailyE += (24 * 60 / 10) * 5; // ~720
                    } else {
                        dailyE += (24 * 60 / 15) * 5; // ~480
                    }

                    dailyE += 750; // Xanax Estimate
                    dailyE += maxEnergy; // Refill Estimate

                    userData = {
                        perkMultiplier: multiplier,
                        dailyEnergy: dailyE,
                        hasMusicStore: musicActive,
                        isLoaded: true
                    };

                    callback();

                } catch (e) {
                    console.error('Error parsing API data', e);
                }
            }
        });
    }

    // --- Main UI Logic ---
    function init() {
        if ($('#QaimEnergyDashboard').length > 0) return;

        // Find hooks
        const percentageEl = Array.from(document.querySelectorAll('div[class^="percentage"]')).find(el => el.innerText.includes('%'));
        if (!percentageEl) return;

        const buttonContainer = $(percentageEl).closest('li[id^="gym-"]');
        if (!buttonContainer.length) return;

        const gymIdStr = buttonContainer.attr('id'); 
        const gymNum = parseInt(gymIdStr.replace("gym-", ""), 10);

        if (isNaN(gymNum) || gymNum < 2 || (gymNum - 2) >= GYM_ENERGIES.length) return;

        injectStyles();

        // Build Dashboard
        const dashboard = $(`
            <div class="qaim-gym-card" id="QaimEnergyDashboard">
                <div class="qaim-gym-info">
                    <div class="qaim-label">Energy to Unlock</div>
                    <div class="qaim-values">
                        <span class="qaim-highlight" id="qaim-rem">Loading...</span>
                        <span class="qaim-subtext"> / <span id="qaim-tot">...</span> E</span>
                    </div>
                </div>
                <div class="qaim-controls">
                    <div class="qaim-badge" id="qaim-api-badge">API: Missing</div>
                    <div class="qaim-badge" id="qaim-music-badge">Music Store: OFF</div>
                    <div class="qaim-days" id="qaim-days">...</div>
                </div>
                <div class="qaim-settings-btn" id="qaim-settings-trigger" title="Settings / API Key">⚙</div>
            </div>
        `);

        // Build Modal
        const modal = $(`
            <div class="qaim-overlay" id="qaim-overlay"></div>
            <div class="qaim-modal" id="qaim-modal">
                <h3 style="color:#00bcd4; margin-top:0;">API Configuration</h3>
                <p style="color:#ccc; font-size:12px; margin-bottom:15px;">
                    This script requires a <b style="color:#fff">Public API Key</b> to auto-detect your perks and energy usage.
                </p>
                <input type="text" class="qaim-input" id="qaim-api-input" placeholder="Enter Public API Key" value="${apiKey}">
                <button class="qaim-save-btn" id="qaim-save-btn">Save & Reload</button>
            </div>
        `);

        // Inject
        const targetContainer = buttonContainer.find('ul.properties').parent();
        (targetContainer.length ? targetContainer : buttonContainer).append(dashboard);
        $('body').append(modal);

        // Logic
        const gymPercentage = parseFloat(percentageEl.innerText.replace("%", ""));

        function updateDisplay() {
            let totalReq = GYM_ENERGIES[gymNum - 2];
            
            // Apply Multiplier (Music Store)
            if (userData.hasMusicStore) {
                totalReq = Math.round(totalReq / userData.perkMultiplier);
            }

            const remaining = Math.max(0, Math.round(totalReq * ((100 - gymPercentage) / 100)));
            const days = (remaining / userData.dailyEnergy).toFixed(1);

            $('#qaim-rem').text(formatNum(remaining));
            $('#qaim-tot').text(formatNum(totalReq));
            $('#qaim-days').text(`~${days} days (@${Math.round(userData.dailyEnergy)}e/day)`);

            // Update Badges
            if (apiKey) {
                $('#qaim-api-badge').addClass('active').text('API: Active');
            } else {
                $('#qaim-api-badge').removeClass('active').text('API: None');
            }

            if (userData.hasMusicStore) {
                $('#qaim-music-badge').addClass('active').text('Music Store: Active');
            } else {
                $('#qaim-music-badge').removeClass('active').text('Music Store: Inactive');
            }
        }

        // Functions to control Modal
        function showModal() {
             $('#qaim-modal, #qaim-overlay').fadeIn(200);
        }

        function hideModal() {
             $('#qaim-modal, #qaim-overlay').fadeOut(200);
        }

        // Event Handlers
        $('#qaim-settings-trigger').on('click', function(e) {
            e.stopPropagation(); 
            showModal();
        });

        $('#qaim-overlay').on('click', function() {
            hideModal();
        });

        $('#qaim-save-btn').on('click', function() {
            const newKey = $('#qaim-api-input').val().trim();
            GM_setValue('qaim_torn_api_key', newKey);
            location.reload();
        });

        // Initialize Fetch
        updateDisplay(); // Show base data first
        
        if (apiKey) {
            fetchApiData(updateDisplay);
        } else if (!promptViewed) {
            // First time run? Ask for API key once.
            showModal();
            GM_setValue('qaim_api_prompt_viewed', true);
        }
    }

    // --- Poll for Load ---
    let attempts = 0;
    const interval = setInterval(() => {
        if ($('li[id^="gym-"]').length > 0) {
            clearInterval(interval);
            init();
        }
        attempts++;
        if (attempts > 50) clearInterval(interval);
    }, 200);

})();
