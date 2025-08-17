let filesData = [];
let sortFavoritesOnly = false;

const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const searchBar = document.getElementById('searchBar');
const sortType = document.getElementById('sortType');
const artistFilter = document.getElementById('artistFilter');
const collectionFilter = document.getElementById('collectionFilter');

artistFilter.addEventListener('change', renderList);
collectionFilter.addEventListener('change', renderList);

// ===================== IndexedDB =====================
let db;
const DB_NAME = "CifrasDB";
const STORE_NAME = "pdfs";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve();
    };
    request.onerror = (e) => reject(e);
  });
}

function savePDFtoDB(id, file) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id, blob: file });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function getPDFfromDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = (e) => reject(e);
  });
}

function deletePDFfromDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

// ===================== Upload de arquivos =====================
fileInput.addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    const reader = new FileReader();
    reader.onload = async (event) => {
      let cleanName = file.name.replace(/(\.pdf)+$/i, '');
      let artist = cleanName.includes('-') ? cleanName.split('-')[0].trim() : 'Desconhecido';
      const preview = await renderPDFPreview(event.target.result);

      const id = Date.now() + "_" + Math.random(); // id único
      await savePDFtoDB(id, file); // salva PDF real no IndexedDB

      const data = {
        id,
        name: cleanName,
        favorite: false,
        preview: preview,
        artist: artist,
        collection: '',
        tags: [],
      };
      filesData.push(data);
      saveAndRender();
    };
    reader.readAsDataURL(file);
  }
  fileInput.value = '';
});

searchBar.addEventListener('input', renderList);

function toggleSort() {
  sortFavoritesOnly = !sortFavoritesOnly;
  sortType.textContent = sortFavoritesOnly ? 'Favoritos' : 'Todos';
  renderList();
}

function toggleDarkMode() {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', document.body.classList.contains('dark') ? '1' : '0');
}

if (localStorage.getItem('darkMode') === '1') {
  document.body.classList.add('dark');
}

function saveAndRender() {
  localStorage.setItem('myCifrasMeta', JSON.stringify(filesData));
  updateArtistFilter();
  updateCollectionFilter();
  renderList();
}

function updateArtistFilter() {
  const uniqueArtists = [...new Set(filesData.map(f => f.artist))];
  artistFilter.innerHTML = '<option value="">🎤 Todos os Artistas</option>';
  uniqueArtists.forEach(artist => {
    const option = document.createElement('option');
    option.value = artist;
    option.textContent = artist;
    artistFilter.appendChild(option);
  });
}

function updateCollectionFilter() {
  const uniqueCollections = [...new Set(filesData.map(f => f.collection).filter(c => c && c.trim() !== ''))];
  uniqueCollections.sort((a,b) => a.localeCompare(b));
  collectionFilter.innerHTML = '<option value="">📁 Todas as Coleções</option>';
  uniqueCollections.forEach(collection => {
    const option = document.createElement('option');
    option.value = collection;
    option.textContent = collection;
    collectionFilter.appendChild(option);
  });
}

async function renderPDFPreview(dataUrl) {
  try {
    const base64 = dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

async function renderList() {
  const term = searchBar.value.toLowerCase();
  fileList.innerHTML = '';

  let sorted = [...filesData];
  if (sortFavoritesOnly) {
    sorted = sorted.filter(f => f.favorite);
  }

  const selectedArtist = artistFilter.value;
  if (selectedArtist) {
    sorted = sorted.filter(f => f.artist === selectedArtist);
  }

  const selectedCollection = collectionFilter.value;
  if (selectedCollection) {
    sorted = sorted.filter(f => f.collection === selectedCollection);
  }

  sorted.sort((a, b) => a.name.localeCompare(b.name));

  for (const file of sorted) {
    if (!file.name.toLowerCase().includes(term) &&
        !file.tags.some(t => t.toLowerCase().includes(term))) continue;

    const item = document.createElement('div');
    item.className = 'file-item';
    item.draggable = true;

    item.ondragstart = (e) => {
      e.dataTransfer.setData('text/plain', filesData.indexOf(file));
    };
    item.ondragover = (e) => e.preventDefault();
    item.ondrop = (e) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIndex = filesData.indexOf(file);
      if (fromIndex !== toIndex) {
        const moved = filesData.splice(fromIndex, 1)[0];
        filesData.splice(toIndex, 0, moved);
        saveAndRender();
      }
    };

    const thumb = document.createElement('img');
    thumb.className = 'thumbnail';
    thumb.src = file.preview || '';

    // Abre PDF do IndexedDB
    thumb.onclick = async () => {
      const blob = await getPDFfromDB(file.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    };
    item.appendChild(thumb);

    const fav = document.createElement('div');
    fav.textContent = '★';
    fav.className = 'favorite-btn' + (file.favorite ? ' marked' : '');
    fav.onclick = (e) => {
      e.stopPropagation();
      file.favorite = !file.favorite;
      saveAndRender();
    };
    item.appendChild(fav);

    const del = document.createElement('div');
    del.className = 'delete-btn';
    del.textContent = '❌';
    del.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`Excluir "${file.name}"?`)) {
        // remove metadados
        filesData.splice(filesData.indexOf(file), 1);
        saveAndRender();
        // remove do IndexedDB
        await deletePDFfromDB(file.id);
      }
    };
    item.appendChild(del);

    const nameText = document.createElement('div');
    nameText.className = 'file-name';
    nameText.textContent = file.name;
    nameText.title = "Clique para renomear";
    nameText.onclick = (e) => {
      e.stopPropagation();
      item.draggable = false;

      nameText.innerHTML = '';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = file.name;
      input.style.marginBottom = '0.3rem';
      input.style.width = '100%';

      const collectionInput = document.createElement('input');
      collectionInput.type = 'text';
      collectionInput.placeholder = 'Coleção (ex: Ensaio)';
      collectionInput.value = file.collection || '';
      collectionInput.style.marginBottom = '0.3rem';
      collectionInput.style.width = '100%';

      const tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.placeholder = 'Tags separadas por espaço (#ensaio #romantica)';
      tagInput.value = (file.tags || []).join(' ');
      tagInput.style.width = '100%';

      nameText.appendChild(input);
      nameText.appendChild(collectionInput);
      nameText.appendChild(tagInput);

      [input, collectionInput, tagInput].forEach(el => {
        el.addEventListener('dragstart', e => e.stopPropagation());
        el.addEventListener('click', e => e.stopPropagation());
      });

      input.focus();

      function saveData() {
        const newName = input.value.trim();
        if (newName) {
          file.name = newName;
          file.artist = newName.includes('-') ? newName.split('-')[0].trim() : 'Desconhecido';
          file.collection = collectionInput.value.trim();
          file.tags = tagInput.value
            .split(' ')
            .map(t => t.trim())
            .filter(t => t.startsWith('#') && t.length > 1);
        }
        item.draggable = true;
        saveAndRender();
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveData();
        } else if (e.key === 'Escape') {
          renderList();
        }
      });

      document.addEventListener('click', function handleClickOutside(ev) {
        if (!item.contains(ev.target)) {
          document.removeEventListener('click', handleClickOutside);
          saveData();
        }
      });
    };
    item.appendChild(nameText);

    if (file.collection) {
      const collectionDiv = document.createElement('div');
      collectionDiv.className = 'collection';
      collectionDiv.textContent = `📁 ${file.collection}`;
      item.appendChild(collectionDiv);
    }

    if (file.tags && file.tags.length) {
      const tagContainer = document.createElement('div');
      tagContainer.className = 'tags';
      file.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'tag';
        tagSpan.textContent = tag;
        tagSpan.onclick = () => {
          searchBar.value = tag;
          renderList();
        };
        tagContainer.appendChild(tagSpan);
      });
      item.appendChild(tagContainer);
    }

    fileList.appendChild(item);
  }
}

function loadFromStorage() {
  const data = localStorage.getItem('myCifrasMeta');
  if (data) {
    filesData = JSON.parse(data);
    updateArtistFilter();
    updateCollectionFilter();
    renderList();
  }
}

// inicialização
(async function init() {
  await openDB();
  loadFromStorage();
})();
