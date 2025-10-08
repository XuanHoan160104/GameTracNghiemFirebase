const firebaseConfig = {
    apiKey: "AIzaSyD0hpsst74ici7gSvjIhumx94i5O1Xf85w",
    authDomain: "game-1ebdc.firebaseapp.com",
    databaseURL: "https://game-1ebdc-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "game-1ebdc",
    storageBucket: "game-1ebdc.appspot.com",
    messagingSenderId: "139009888753",
    appId: "1:139009888753:web:bd7a40cd4a4b110318f450",
    measurementId: "G-WZRE9N760C"
  };
  
  // 🔥 Khởi tạo Firebase
  const app = firebase.initializeApp(firebaseConfig);
  const db = firebase.database();
  