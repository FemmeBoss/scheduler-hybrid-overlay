import { setDoc, getDoc, getDocs, collection, doc, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { db } from '../core/firebase-config.js';  // Correct path

// 💾 Save Group
document.getElementById('saveGroupBtn')?.addEventListener('click', async () => {
  const groupName = document.getElementById('groupNameInput')?.value.trim();
  if (!groupName) return alert("Please enter a group name first!");

  const checkboxes = document.querySelectorAll('.page-checkbox:checked');
  const selectedIds = Array.from(checkboxes).map(cb => ({
    id: cb.dataset.id,
    name: cb.dataset.name,
    platform: cb.dataset.platform,
    parentId: cb.dataset.parentId
  }));

  if (!selectedIds.length) return alert("Please select at least one page to save.");

  try {
    await setDoc(doc(db, 'page_groups', groupName), { pages: selectedIds });
    console.log(`[GROUP] ✅ Saved group: ${groupName}`);
    alert(`Group "${groupName}" saved.`);
    await loadGroups(); // Refresh the group list
  } catch (err) {
    console.error("🔥 Error saving group:", err);
    alert("Failed to save group.");
  }
});

// 📂 Load Groups into Dropdown
async function loadGroups() {
  const select = document.getElementById('groupSelect');
  const groupActions = document.getElementById('groupActions');
  if (!select) return;

  select.innerHTML = `<option value="">Select a saved group</option>`;
  
  // Create or update group actions container
  if (!groupActions) {
    const actionsDiv = document.createElement('div');
    actionsDiv.id = 'groupActions';
    actionsDiv.style.display = 'none';
    actionsDiv.innerHTML = `
      <button id="editGroupBtn" class="btn btn-secondary">Edit Group</button>
      <button id="deleteGroupBtn" class="btn btn-danger">Delete Group</button>
    `;
    select.parentNode.insertBefore(actionsDiv, select.nextSibling);
  }

  try {
    const snapshot = await getDocs(collection(db, 'page_groups'));
    snapshot.forEach(docSnap => {
      const opt = document.createElement('option');
      opt.value = docSnap.id;
      opt.textContent = docSnap.id;
      select.appendChild(opt);
    });
    console.log("[GROUP] ✅ Groups loaded into dropdown");
  } catch (err) {
    console.error("🔥 Failed to load groups:", err);
    alert("Failed to load groups.");
  }
}

// 📦 Load Group Pages when selected
document.getElementById('groupSelect')?.addEventListener('change', async (e) => {
  const groupName = e.target.value;
  const groupActions = document.getElementById('groupActions');
  
  // Show/hide action buttons based on selection
  if (groupActions) {
    groupActions.style.display = groupName ? 'flex' : 'none';
  }

  if (!groupName) {
    // Show all pages when no group is selected
    document.querySelectorAll('#facebookPages .profile-container, #instagramPages .profile-container').forEach(container => {
      container.style.display = 'flex';
    });
    document.querySelectorAll('.page-checkbox').forEach(cb => {
      cb.checked = false;
    });
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'page_groups', groupName));
    if (!snap.exists()) return alert("Group not found.");

    const { pages = [] } = snap.data();
    
    // Get all page containers from both sidebars
    const pageContainers = document.querySelectorAll('#facebookPages .profile-container, #instagramPages .profile-container');
    
    // First, hide all pages in both sidebars
    pageContainers.forEach(container => {
      container.style.display = 'none';
    });

    // Then, show and check only the pages in the group
    document.querySelectorAll('.page-checkbox').forEach(cb => {
      const isInGroup = pages.some(p => p.id === cb.dataset.id);
      cb.checked = isInGroup;
      
      // Show container if page is in group
      if (isInGroup) {
        const container = cb.closest('.profile-container');
        if (container) {
          container.style.display = 'flex';
        }
      }
    });

    console.log(`[GROUP] ✅ Loaded group: ${groupName}`);
  } catch (err) {
    console.error("🔥 Failed to load group:", err);
    alert("Failed to load group.");
  }
});

// 🗑️ Delete Group
document.addEventListener('click', async (e) => {
  if (e.target.id === 'deleteGroupBtn') {
    const select = document.getElementById('groupSelect');
    const groupName = select?.value;
    
    if (!groupName) return;
    
    if (confirm(`Are you sure you want to delete the group "${groupName}"?`)) {
      try {
        await deleteDoc(doc(db, 'page_groups', groupName));
        console.log(`[GROUP] ✅ Deleted group: ${groupName}`);
        alert(`Group "${groupName}" deleted.`);
        await loadGroups();
        
        // Reset view
        document.querySelectorAll('#facebookPages .profile-container, #instagramPages .profile-container').forEach(container => {
          container.style.display = 'flex';
        });
        document.querySelectorAll('.page-checkbox').forEach(cb => {
          cb.checked = false;
        });
      } catch (err) {
        console.error("🔥 Error deleting group:", err);
        alert("Failed to delete group.");
      }
    }
  }
});

// ✏️ Edit Group
document.addEventListener('click', async (e) => {
  if (e.target.id === 'editGroupBtn') {
    const select = document.getElementById('groupSelect');
    const groupName = select?.value;
    const groupNameInput = document.getElementById('groupNameInput');
    
    if (!groupName) return;
    
    // Set the group name in the input field
    if (groupNameInput) {
      groupNameInput.value = groupName;
    }
    
    // The current page selection will be used when saving
    alert(`Edit the group "${groupName}" by:\n1. Adjusting page selections\n2. Optionally changing the name in the group name input\n3. Clicking 'Save Group'`);
  }
});

// 🚀 Load on startup
window.addEventListener('load', loadGroups);