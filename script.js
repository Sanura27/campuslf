/**
 * Campus Lost & Found - Application Logic
 * Handles state, persistence, UI updates, and verification scoring.
 */

// --- State Management ---
let reports = JSON.parse(localStorage.getItem('campusLF_reports')) || [];
let claims = JSON.parse(localStorage.getItem('campusLF_claims')) || [];

// --- Constants ---
const TABS = ['dashboard', 'search', 'report-lost', 'report-found', 'claim'];

// --- DOM Elements ---
const navBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const lostForm = document.getElementById('lost-form');
const foundForm = document.getElementById('found-form');
const claimForm = document.getElementById('claim-form');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const filterCategory = document.getElementById('filter-category');
const imagePreviewContainer = document.getElementById('image-preview-container');
const idPreview = document.getElementById('id-preview');
const fileInput = document.getElementById('claim-id-card');
const claimItemSelect = document.getElementById('claim-item-select');

// --- Navigation Logic ---
function navigateToStatus(status) {
    if (status === 'claim') {
        switchTab('view-claims');
    } else {
        switchTab('search');
        if (filterStatus) {
            filterStatus.value = status;
            renderAllReports();
        }
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    updateStats();
    renderAllReports();
    renderRecentReports();
    renderAllClaims();

    // Tab Navigation
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Form Submissions
    if (lostForm) lostForm.addEventListener('submit', handleReportSubmit);
    if (foundForm) foundForm.addEventListener('submit', handleReportSubmit);
    if (claimForm) claimForm.addEventListener('submit', handleClaimSubmit);

    // Filter Listeners
    if (searchInput) searchInput.addEventListener('input', renderAllReports);
    if (filterStatus) filterStatus.addEventListener('change', renderAllReports);
    if (filterCategory) filterCategory.addEventListener('change', renderAllReports);

    // Claim Item Dropdown Selection
    if (claimItemSelect) {
        claimItemSelect.addEventListener('change', (e) => {
            const selectedId = e.target.value;
            const fieldsToToggle = [
                'claim-item-name', 'claim-category', 'claim-color', 
                'claim-location', 'claim-date', 'claim-description'
            ];
            
            if (selectedId) {
                const item = reports.find(r => r.id === selectedId);
                if (item) {
                    document.getElementById('claim-item-name').value = item.itemName;
                    document.getElementById('claim-category').value = item.category;
                    document.getElementById('claim-color').value = item.color || '';
                    document.getElementById('claim-location').value = item.location;
                    document.getElementById('claim-date').value = item.date;
                    document.getElementById('claim-description').value = item.description;
                    
                    // Set fields to readonly
                    fieldsToToggle.forEach(id => {
                        const el = document.getElementById(id);
                        el.readOnly = true;
                        if (el.tagName === 'SELECT') el.style.pointerEvents = 'none'; // Select doesn't support readonly
                    });
                }
            } else {
                // Clear manual fields and remove readonly if switched back to manual
                fieldsToToggle.forEach(id => {
                    const el = document.getElementById(id);
                    el.value = '';
                    el.readOnly = false;
                    if (el.tagName === 'SELECT') {
                        el.style.pointerEvents = 'auto';
                        el.value = '';
                    }
                });
            }
        });
    }

    // Image Preview
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    idPreview.src = e.target.result;
                    imagePreviewContainer.classList.remove('hide');
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

// --- Tab System ---
function switchTab(tabId) {
    tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId) content.classList.add('active');
    });

    navBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) btn.classList.add('active');
    });

    // Reset forms when switching
    if (tabId === 'claim') resetClaimForm();
    if (tabId === 'view-claims') renderAllClaims();
    
    window.scrollTo(0, 0);
}

// --- Data Persistence ---
function saveToLocalStorage() {
    localStorage.setItem('campusLF_reports', JSON.stringify(reports));
    localStorage.setItem('campusLF_claims', JSON.stringify(claims));
    updateStats();
}

// --- Form Handling ---
function handleReportSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const report = Object.fromEntries(formData.entries());
    
    // Add metadata
    report.id = Date.now().toString();
    report.createdAt = new Date().toISOString();
    
    reports.push(report);
    saveToLocalStorage();
    
    e.target.reset();
    alert(`Successfully reported ${report.status} item: ${report.itemName}`);
    
    switchTab('dashboard');
    renderRecentReports();
    renderAllReports();
}

function handleClaimSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const claimData = Object.fromEntries(formData.entries());
    
    claimData.id = Date.now().toString();
    claimData.createdAt = new Date().toISOString();
    
    // Calculate match score against Found items
    const matches = findMatches(claimData);
    const bestMatch = matches.length > 0 ? matches[0] : null;
    const score = bestMatch ? bestMatch.score : 0;

    // Save claim
    claims.push(claimData);
    saveToLocalStorage();

    showClaimResult(score, matches);
}

// --- Verification Logic ---
const STOP_WORDS = ['the', 'this', 'that', 'with', 'from', 'some', 'item', 'found', 'lost', 'near', 'beside', 'color', 'inside', 'outside', 'around'];

function extractKeywords(text) {
    if (!text) return [];
    return text.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.includes(word));
}

function findMatches(claim) {
    // We only match claims against FOUND items that aren't returned
    const foundItems = reports.filter(r => r.status === 'found');
    
    const matchedResults = foundItems.map(item => {
        let score = 0;
        
        // 1. Name Match (30%) - Partial matching
        if (item.itemName.toLowerCase().includes(claim.itemName.toLowerCase()) || 
            claim.itemName.toLowerCase().includes(item.itemName.toLowerCase())) {
            score += 30;
        }

        // 2. Category Match (20%) - Exact match
        if (item.category === claim.category) {
            score += 20;
        }

        // 3. Color Match (10%) - Simple check
        if (claim.color && item.color && 
            (item.color.toLowerCase().includes(claim.color.toLowerCase()) || 
             claim.color.toLowerCase().includes(item.color.toLowerCase()))) {
            score += 10;
        }

        // 4. Location Match (20%) - Simple check
        if (item.location.toLowerCase().includes(claim.location.toLowerCase()) || 
            claim.location.toLowerCase().includes(item.location.toLowerCase())) {
            score += 20;
        }

        // 5. Unique Feature (20%) - Keyword matching with stop-word filtering
        const itemFeature = item.uniqueFeature.toLowerCase();
        const claimKeywords = extractKeywords(claim.uniqueFeature);
        
        if (claimKeywords.length > 0) {
            let keywordMatches = 0;
            claimKeywords.forEach(word => {
                if (itemFeature.includes(word)) keywordMatches++;
            });
            score += Math.min(20, (keywordMatches / claimKeywords.length) * 20);
        }

        return { ...item, score: Math.round(score) };
    });

    // Sort by score descending
    return matchedResults.sort((a, b) => b.score - a.score);
}

function showClaimResult(score, matches) {
    const step1 = document.getElementById('claim-step-1');
    const resultSection = document.getElementById('claim-result');
    const scoreBadge = document.getElementById('verification-score-badge');
    const message = document.getElementById('verification-message');
    const matchesContainer = document.getElementById('potential-matches');

    step1.classList.add('hide');
    resultSection.classList.remove('hide');
    
    scoreBadge.textContent = score + '%';
    
    if (score >= 80) {
        message.textContent = "Strong match! Ownership is highly likely verified.";
        scoreBadge.style.backgroundColor = 'var(--found)';
    } else if (score >= 50) {
        message.textContent = "Likely valid claim. Staff will contact you for final confirmation.";
        scoreBadge.style.backgroundColor = 'var(--warning)';
    } else {
        message.textContent = "More verification required. The details provided don't strongly match any current reports.";
        scoreBadge.style.backgroundColor = 'var(--lost)';
    }

    // Show top 3 potential items
    matchesContainer.innerHTML = '<h4>Potential Matches:</h4>';
    if (matches.length === 0) {
        matchesContainer.innerHTML += '<p>No matching found items in the database yet.</p>';
    } else {
        matches.slice(0, 3).forEach(match => {
            const div = document.createElement('div');
            div.className = 'match-item';
            div.innerHTML = `
                <strong>${match.itemName}</strong> (${match.category})<br>
                <small>Found at: ${match.location} on ${match.date}</small><br>
                <small>Match Confidence: ${match.score}%</small>
            `;
            matchesContainer.appendChild(div);
        });
    }
}

function resetClaimForm() {
    document.getElementById('claim-step-1').classList.remove('hide');
    document.getElementById('claim-result').classList.add('hide');
    claimForm.reset();
    imagePreviewContainer.classList.add('hide');

    // Populate dropdown with current found items
    if (claimItemSelect) {
        claimItemSelect.innerHTML = '<option value="">-- Manual Entry --</option>';
        const foundItems = reports.filter(r => r.status === 'found');
        foundItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.itemName} (Found at ${item.location})`;
            claimItemSelect.appendChild(option);
        });
    }
}

// --- Rendering Logic ---
function createItemCard(item) {
    const template = document.getElementById('item-card-template');
    const card = template.content.cloneNode(true).querySelector('.item-card');
    
    const statusBadge = card.querySelector('.status-badge');
    statusBadge.textContent = item.status;
    statusBadge.classList.add(item.status);

    const categoryBadge = card.querySelector('.category-badge');
    categoryBadge.textContent = item.category;

    card.querySelector('.item-title').textContent = item.itemName;
    card.querySelector('.val-location').textContent = item.location;
    card.querySelector('.val-date').textContent = item.date;
    card.querySelector('.item-desc').textContent = item.description;

    const returnBtn = card.querySelector('.return-btn');
    if (item.status === 'returned') {
        returnBtn.style.display = 'none';
        statusBadge.classList.add('returned');
    }

    returnBtn.addEventListener('click', () => markAsReturned(item.id));
    card.querySelector('.delete-btn').addEventListener('click', () => deleteReport(item.id));

    return card;
}

function renderRecentReports() {
    const container = document.getElementById('recent-reports');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Last 6 items
    const recent = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
    
    if (recent.length === 0) {
        container.innerHTML = '<p class="text-light">No reports yet.</p>';
        return;
    }

    recent.forEach(item => {
        container.appendChild(createItemCard(item));
    });
}

function renderAllReports() {
    const container = document.getElementById('all-reports');
    if (!container) return;

    const searchTerm = searchInput.value.toLowerCase();
    const statusVal = filterStatus.value;
    const categoryVal = filterCategory.value;

    const filtered = reports.filter(item => {
        const matchesSearch = item.itemName.toLowerCase().includes(searchTerm) || 
                             item.category.toLowerCase().includes(searchTerm) ||
                             item.location.toLowerCase().includes(searchTerm) ||
                             item.description.toLowerCase().includes(searchTerm);
        
        const matchesStatus = statusVal === 'all' || item.status === statusVal;
        const matchesCategory = categoryVal === 'all' || item.category === categoryVal;

        return matchesSearch && matchesStatus && matchesCategory;
    });

    container.innerHTML = '';
    
    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-light">No items found matching your filters.</p>';
        return;
    }

    filtered.forEach(item => {
        container.appendChild(createItemCard(item));
    });
}

// --- Management Actions ---
function markAsReturned(id) {
    const index = reports.findIndex(r => r.id === id);
    if (index !== -1) {
        reports[index].status = 'returned';
        saveToLocalStorage();
        renderRecentReports();
        renderAllReports();
    }
}

function deleteReport(id) {
    if (confirm('Are you sure you want to delete this report?')) {
        reports = reports.filter(r => r.id !== id);
        saveToLocalStorage();
        renderRecentReports();
        renderAllReports();
    }
}

function updateStats() {
    const lostCount = reports.filter(r => r.status === 'lost').length;
    const foundCount = reports.filter(r => r.status === 'found').length;
    const returnedCount = reports.filter(r => r.status === 'returned').length;
    const claimsCount = claims.length;

    document.getElementById('stat-lost').textContent = lostCount;
    document.getElementById('stat-found').textContent = foundCount;
    document.getElementById('stat-claims').textContent = claimsCount;
    document.getElementById('stat-returned').textContent = returnedCount;
}

function renderAllClaims() {
    const container = document.getElementById('claims-list');
    if (!container) return;

    container.innerHTML = '';
    
    if (claims.length === 0) {
        container.innerHTML = '<p class="text-light">No claims submitted yet.</p>';
        return;
    }

    claims.forEach(claim => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="badge status-badge claim-pending">Claim Filed</span>
                <span class="badge category-badge">${claim.category}</span>
            </div>
            <h4 class="item-title">${claim.itemName}</h4>
            <div class="item-details">
                <div class="detail"><span class="label">By:</span> <span>${claim.contactName}</span></div>
                <div class="detail"><span class="label">Date Lost:</span> <span>${claim.date}</span></div>
                <div class="detail"><span class="label">Location:</span> <span>${claim.location}</span></div>
            </div>
            <p class="item-desc">${claim.description}</p>
            <div class="card-footer">
                <button class="card-btn delete-btn" onclick="deleteClaim('${claim.id}')">Delete Claim</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function deleteClaim(id) {
    if (confirm('Are you sure you want to delete this claim?')) {
        claims = claims.filter(c => c.id !== id);
        saveToLocalStorage();
        renderAllClaims();
    }
}
