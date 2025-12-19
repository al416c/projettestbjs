import "./style.css"; // Import du style qu'on vient de nettoyer
import { 
    Engine, 
    Scene, 
    Vector3, 
    HemisphericLight, 
    FreeCamera, 
    MeshBuilder, 
    PhysicsAggregate, 
    PhysicsShapeType,
    HavokPlugin,
    KeyboardEventTypes,
    Color3,
    StandardMaterial,
    Quaternion
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

// --- INITIALISATION DU MOTEUR ---
const canvas = document.getElementById("app") as HTMLCanvasElement || document.createElement("canvas");
if (!document.getElementById("app")) {
    canvas.id = "renderCanvas";
    document.body.appendChild(canvas);
}

const engine = new Engine(canvas, true);

// --- CRÉATION DE LA SCÈNE ---
async function createScene() {
    const scene = new Scene(engine);

    // 1. Initialiser la Physique (Havok)
    const havokInstance = await HavokPhysics();
    const hk = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(new Vector3(0, -9.81, 0), hk);

    // 2. Caméra & Lumière
    const camera = new FreeCamera("camera1", new Vector3(0, 10, -20), scene);
    camera.setTarget(Vector3.Zero());
    
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // 3. Le Sol
    const ground = MeshBuilder.CreateGround("ground", { width: 30, height: 30 }, scene);
    const groundMat = new StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new Color3(0.2, 0.2, 0.3);
    ground.material = groundMat;
    new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

    // 4. Le Joueur
    const player = MeshBuilder.CreateBox("player", { size: 2 }, scene);
    player.position.y = 5;
    player.rotationQuaternion = new Quaternion(); // Important pour l'enregistrement de la rotation
    const playerMat = new StandardMaterial("playerMat", scene);
    playerMat.diffuseColor = new Color3(0, 0.9, 1);
    playerMat.emissiveColor = new Color3(0, 0.2, 0.3);
    player.material = playerMat;

    const playerAgg = new PhysicsAggregate(player, PhysicsShapeType.BOX, { mass: 1, restitution: 0.0 }, scene);
    playerAgg.body.setMassProperties({ inertia: new Vector3(0, 0, 0) });

    // --- LOGIQUE DES CLONES & FANTÔMES ---

    // Matériau pour les clones
    const cloneMat = new StandardMaterial("cloneMat", scene);
    cloneMat.diffuseColor = new Color3(0, 0.9, 1);
    cloneMat.alpha = 0.4;

    // Matériau pour les fantômes
    const phantomMat = new StandardMaterial("phantomMat", scene);
    phantomMat.diffuseColor = new Color3(1, 0.2, 0.5); // Rose/Rouge
    phantomMat.alpha = 0.6;

    // Enregistrement des 5 dernières secondes de mouvement
    const recordingDuration = 5; // secondes
    const maxRecordedStates = recordingDuration * 60; // 60fps
    const recordedStates: { position: Vector3, rotation: Quaternion }[] = [];

    // 5. Gestion des Inputs
    const inputMap: { [key: string]: boolean } = {};
    scene.onKeyboardObservable.add((kbInfo) => {
        const key = kbInfo.event.key.toLowerCase();
        if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
            inputMap[key] = true;

            // CRÉATION DE CLONE
            if (key === "c") {
                const clone = MeshBuilder.CreateBox("clone", { size: 2 }, scene);
                clone.material = cloneMat;
                clone.position.copyFrom(player.position);
                setTimeout(() => clone.dispose(), 5000);
            }

            // CRÉATION DE FANTÔME
            if (key === "v") {
                const phantom = MeshBuilder.CreateBox("phantom", { size: 2 }, scene);
                phantom.material = phantomMat;
                phantom.rotationQuaternion = new Quaternion();

                // Copie des états enregistrés pour que le fantôme ait sa propre "timeline"
                const phantomStates = [...recordedStates]; 
                let frame = 0;

                const replayObservable = scene.onBeforeRenderObservable.add(() => {
                    if (frame < phantomStates.length) {
                        const state = phantomStates[frame];
                        phantom.position.copyFrom(state.position);
                        phantom.rotationQuaternion!.copyFrom(state.rotation);
                        frame++;
                    } else {
                        // Fin de la lecture, on nettoie tout
                        scene.onBeforeRenderObservable.remove(replayObservable);
                        phantom.dispose();
                    }
                });
            }

        } else {
            inputMap[key] = false;
        }
    });

    // 6. Boucle de Jeu
    const playerSpeed = 10;
    scene.onBeforeRenderObservable.add(() => {
        // --- Enregistrement du mouvement du joueur ---
        if (recordedStates.length >= maxRecordedStates) {
            recordedStates.shift(); // Enlève le plus vieil état
        }
        recordedStates.push({
            position: player.position.clone(),
            rotation: player.rotationQuaternion!.clone()
        });

        // --- Mouvement du joueur ---
        if (!playerAgg.body) return;
        let velocity = new Vector3(0, 0, 0);
        
        if (inputMap["z"] || inputMap["arrowup"]) velocity.z = playerSpeed;
        if (inputMap["s"] || inputMap["arrowdown"]) velocity.z = -playerSpeed;
        if (inputMap["q"] || inputMap["arrowleft"]) velocity.x = -playerSpeed;
        if (inputMap["d"] || inputMap["arrowright"]) velocity.x = playerSpeed;

        const currentVel = new Vector3();
        playerAgg.body.getLinearVelocityToRef(currentVel);
        playerAgg.body.setLinearVelocity(new Vector3(velocity.x, currentVel.y, velocity.z));
    });

    return scene;
}

// --- DÉMARRAGE ---
createScene().then((scene) => {
    engine.runRenderLoop(() => {
        scene.render();
    });
});

window.addEventListener("resize", () => {
    engine.resize();
});