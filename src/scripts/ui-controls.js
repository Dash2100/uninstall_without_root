// UI controls: filter, sort, search

const filterBtn = document.getElementById('button-filter');
const filterMenu = document.getElementById('filter-menu');

const filterItems = {
    all: document.getElementById('filter-all'),
    user: document.getElementById('filter-user'),
    system: document.getElementById('filter-system')
};
const sortItems = {
    name: document.getElementById('sort-name'),
    package: document.getElementById('sort-package'),
    status: document.getElementById('sort-status')
};

function updateFilterMenuIcons() {
    for (const [key, item] of Object.entries(filterItems)) {
        item.setAttribute('icon', key === currentFilter ? 'done' : '');
    }
    for (const [key, item] of Object.entries(sortItems)) {
        item.setAttribute('icon', key === currentSort ? 'done' : '');
    }
}

filterBtn.addEventListener('click', (e) => {
    const rect = filterBtn.getBoundingClientRect();
    filterMenu.style.top = `${rect.bottom + 4}px`;
    filterMenu.style.right = '20px';
    filterMenu.style.left = 'auto';
    filterMenu.classList.toggle('hidden');
    updateFilterMenuIcons();
});

document.addEventListener('click', (e) => {
    if (!filterMenu.contains(e.target) && e.target !== filterBtn) {
        filterMenu.classList.add('hidden');
    }
});

for (const [key, item] of Object.entries(filterItems)) {
    item.addEventListener('click', () => {
        currentFilter = key;
        updateFilterMenuIcons();
        filterMenu.classList.add('hidden');
        if (isConnected) {
            const term = els.searchInput.value.trim().toLowerCase();
            const toShow = term ? filterApps(appsList, term) : appsList;
            renderAppList(toShow);
        }
    });
}

for (const [key, item] of Object.entries(sortItems)) {
    item.addEventListener('click', () => {
        currentSort = key;
        updateFilterMenuIcons();
        filterMenu.classList.add('hidden');
        if (isConnected) {
            const term = els.searchInput.value.trim().toLowerCase();
            const toShow = term ? filterApps(appsList, term) : appsList;
            renderAppList(toShow);
        }
    });
}

// Search & refresh
els.refreshBtn.addEventListener('click', () => isConnected && refreshAppList());

function performSearch() {
    if (!isConnected) return;
    const term = els.searchInput.value.trim().toLowerCase();
    renderAppList(term ? filterApps(appsList, term) : appsList);
}

els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
});
els.searchBtn.addEventListener('click', performSearch);
els.searchInput.addEventListener('clear', () => {
    if (isConnected) renderAppList(appsList);
});
