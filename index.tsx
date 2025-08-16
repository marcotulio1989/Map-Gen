/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

type RockData = {
  model: THREE.Group;
  name: string;
  size: THREE.Vector3;
  box: THREE.Box3;
};

type FoliageData = {
  model: THREE.Group;
  name: string;
};


interface ContourPoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  angle: number;
}

interface PlaceFoliageOptions {
    targetMesh: THREE.Mesh;
    models: FoliageData[];
    densityInput: HTMLInputElement;
    maxCountInput: HTMLInputElement;
    maxSlopeInput: HTMLInputElement;
    scaleInput: HTMLInputElement;
    outerBoundary: THREE.Vector3[];
    innerBoundary: THREE.Vector3[];
    foliageBandWidth: number;
    debugLabel: string;
    outputElement: HTMLElement;
}

interface Lake {
    center: THREE.Vector2;
    radius: number;
    depth: number;
    waterLevel: number;
}

// Helper for Delaunay triangulation
type Vertex2D = { x: number; z: number, originalIndex: number };
type Edge2D = { v0: Vertex2D; v1: Vertex2D };
type Triangle2D = { v0: Vertex2D; v1: Vertex2D; v2: Vertex2D; circumcircle?: { x: number; z: number; radiusSq: number } };

class UnionFind {
    private parent: number[];
    constructor(n: number) {
        this.parent = Array.from({ length: n }, (_, i) => i);
    }
    find(i: number): number {
        if (this.parent[i] === i) return i;
        return this.parent[i] = this.find(this.parent[i]);
    }
    union(i: number, j: number): void {
        const rootI = this.find(i);
        const rootJ = this.find(j);
        if (rootI !== rootJ) {
            this.parent[rootI] = rootJ;
        }
    }
}


class IslandGeneratorApp {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private fbxLoader: FBXLoader;
  private objLoader: OBJLoader;
  private rockModels: RockData[] = [];
  private foliageModels: FoliageData[] = [];
  private group: THREE.Group; // Group to hold all arranged rocks
  private foliageGroup: THREE.Group; // Group to hold foliage
  private pathGroup: THREE.Group; // Group to hold paths
  private waterGroup: THREE.Group; // Group to hold water features
  private riverMeshes: THREE.Mesh[] = []; // For path collision detection
  private contourLine: THREE.Line | null = null;
  private foliageBoundaryLine: THREE.Line | null = null;
  private outerContourLine: THREE.Line | null = null;
  private islandSurface: THREE.Mesh | null = null;
  private groundCoverMesh: THREE.Mesh | null = null;
  private perlin: ImprovedNoise;

  private sandMaterial: THREE.MeshStandardMaterial;
  private rockMaterial: THREE.MeshStandardMaterial;
  private groundCoverMaterial: THREE.MeshStandardMaterial;
  private foliageMaterial: THREE.MeshStandardMaterial;
  private pathMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private riverbedMaterial: THREE.MeshStandardMaterial;

  // DOM Elements
  private rockModelInput: HTMLInputElement;
  private fileCountDisplay: HTMLElement;
  private generateButton: HTMLButtonElement;
  private loadingOverlay: HTMLElement;
  private islandRadiusInput: HTMLInputElement;
  private shorelineOffsetInput: HTMLInputElement;
  private shorelineHeightInput: HTMLInputElement;
  private contourHeightInput: HTMLInputElement;
  private noiseStrengthInput: HTMLInputElement;
  private noiseScaleInput: HTMLInputElement;
  private surfaceSmoothingInput: HTMLInputElement;
  private rockHeightScaleInput: HTMLInputElement;
  
  // Foliage
  private foliageModelInput: HTMLInputElement;
  private foliageModelButton: HTMLButtonElement;
  private foliageFileCountDisplay: HTMLElement;
  private foliageDensityInput: HTMLInputElement;
  private maxFoliageSlopeInput: HTMLInputElement;
  private foliageCoordinatesList: HTMLElement;
  private maxFoliageCountInput: HTMLInputElement;
  private foliageScaleInput: HTMLInputElement;
  private foliageBandWidthInput: HTMLInputElement;
  private foliageBandWidthValue: HTMLElement;

  // Path Generation
  private pathToggleInput: HTMLInputElement;
  private pathPointsInput: HTMLInputElement;
  private pathLoopingInput: HTMLInputElement;
  private pathWidthInput: HTMLInputElement;

  // Water Features
  private waterFeaturesToggle: HTMLInputElement;
  private numLakesInput: HTMLInputElement;
  private lakeRadiusInput: HTMLInputElement;
  private lakeDepthInput: HTMLInputElement;
  private numRiversInput: HTMLInputElement;
  private riverWidthInput: HTMLInputElement;

  // PBR Texture Set Inputs
  private sandSetButton: HTMLButtonElement;
  private sandSetInput: HTMLInputElement;
  private rockSetButton: HTMLButtonElement;
  private rockSetInput: HTMLInputElement;
  private groundCoverSetButton: HTMLButtonElement;
  private groundCoverSetInput: HTMLInputElement;

  // Visualizations
  private showOuterShorelineInput: HTMLInputElement;
  private showCliffEdgeInput: HTMLInputElement;
  private showFoliageBoundaryInput: HTMLInputElement;


  constructor() {
    this.perlin = new ImprovedNoise();
    this.fbxLoader = new FBXLoader();
    this.objLoader = new OBJLoader();
    this.initScene();
    
    // Initialize materials with fallback colors.
    this.sandMaterial = new THREE.MeshStandardMaterial({
        color: 0xC2B280,
        side: THREE.DoubleSide,
        name: 'sand',
        displacementScale: 0
    });
    this.rockMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        name: 'rock',
        displacementScale: 0.2,
        side: THREE.DoubleSide
    });
    this.groundCoverMaterial = new THREE.MeshStandardMaterial({
        color: 0x5C4033, // Dirt brown
        name: 'groundCover',
        displacementScale: 0.2
    });
    this.foliageMaterial = new THREE.MeshStandardMaterial({
        color: 0x4C7F3C,
        roughness: 0.8,
    });
    this.pathMaterial = new THREE.MeshStandardMaterial({
        color: 0x9a8e69, // Darker sand color
        side: THREE.DoubleSide,
    });
    this.waterMaterial = new THREE.MeshStandardMaterial({
        color: 0x336699,
        transparent: true,
        opacity: 0.85,
        roughness: 0.1,
        metalness: 0.2,
        side: THREE.DoubleSide,
    });
    this.riverbedMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4229, // Dark, wet sand
        side: THREE.DoubleSide,
    });


    this.bindUI();
    this.addEventListeners();
    this.animate();
  }

  private initScene() {
    const canvas = document.querySelector('#c') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.camera.position.set(0, 25, 50);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 2, 0);
    this.controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(5, 10, 7.5);
    this.scene.add(directionalLight);
    
    const axesHelper = new THREE.AxesHelper(5);
    this.scene.add(axesHelper);

    this.group = new THREE.Group();
    this.scene.add(this.group);
    
    this.foliageGroup = new THREE.Group();
    this.scene.add(this.foliageGroup);
    
    this.pathGroup = new THREE.Group();
    this.scene.add(this.pathGroup);
    
    this.waterGroup = new THREE.Group();
    this.scene.add(this.waterGroup);


    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private bindUI() {
    this.rockModelInput = document.getElementById('rock-model-input') as HTMLInputElement;
    this.fileCountDisplay = document.getElementById('file-count') as HTMLElement;
    this.generateButton = document.getElementById('generate-button') as HTMLButtonElement;
    this.loadingOverlay = document.getElementById('loading-overlay') as HTMLElement;
    this.islandRadiusInput = document.getElementById('island-radius-input') as HTMLInputElement;
    this.shorelineOffsetInput = document.getElementById('shoreline-offset-input') as HTMLInputElement;
    this.shorelineHeightInput = document.getElementById('shoreline-height-input') as HTMLInputElement;
    this.contourHeightInput = document.getElementById('contour-height-input') as HTMLInputElement;
    this.noiseStrengthInput = document.getElementById('noise-strength-input') as HTMLInputElement;
    this.noiseScaleInput = document.getElementById('noise-scale-input') as HTMLInputElement;
    this.surfaceSmoothingInput = document.getElementById('surface-smoothing-input') as HTMLInputElement;
    this.rockHeightScaleInput = document.getElementById('rock-height-scale-input') as HTMLInputElement;
    
    // Foliage
    this.foliageModelInput = document.getElementById('foliage-model-input') as HTMLInputElement;
    this.foliageModelButton = document.getElementById('foliage-model-button') as HTMLButtonElement;
    this.foliageFileCountDisplay = document.getElementById('foliage-file-count') as HTMLElement;
    this.foliageDensityInput = document.getElementById('foliage-density-input') as HTMLInputElement;
    this.maxFoliageSlopeInput = document.getElementById('max-foliage-slope-input') as HTMLInputElement;
    this.foliageCoordinatesList = document.getElementById('foliage-coordinates-list') as HTMLElement;
    this.maxFoliageCountInput = document.getElementById('max-foliage-count-input') as HTMLInputElement;
    this.foliageScaleInput = document.getElementById('foliage-scale-input') as HTMLInputElement;
    this.foliageBandWidthInput = document.getElementById('foliage-band-width-input') as HTMLInputElement;
    this.foliageBandWidthValue = document.getElementById('foliage-band-width-value') as HTMLElement;

    // Path Generation
    this.pathToggleInput = document.getElementById('path-toggle-input') as HTMLInputElement;
    this.pathPointsInput = document.getElementById('path-points-input') as HTMLInputElement;
    this.pathLoopingInput = document.getElementById('path-looping-input') as HTMLInputElement;
    this.pathWidthInput = document.getElementById('path-width-input') as HTMLInputElement;

    // Water Features
    this.waterFeaturesToggle = document.getElementById('water-features-toggle') as HTMLInputElement;
    this.numLakesInput = document.getElementById('num-lakes-input') as HTMLInputElement;
    this.lakeRadiusInput = document.getElementById('lake-radius-input') as HTMLInputElement;
    this.lakeDepthInput = document.getElementById('lake-depth-input') as HTMLInputElement;
    this.numRiversInput = document.getElementById('num-rivers-input') as HTMLInputElement;
    this.riverWidthInput = document.getElementById('river-width-input') as HTMLInputElement;

    // PBR Texture Set Inputs
    this.sandSetButton = document.getElementById('sand-set-button') as HTMLButtonElement;
    this.sandSetInput = document.getElementById('sand-set-input') as HTMLInputElement;
    this.rockSetButton = document.getElementById('rock-set-button') as HTMLButtonElement;
    this.rockSetInput = document.getElementById('rock-set-input') as HTMLInputElement;
    this.groundCoverSetButton = document.getElementById('ground-cover-set-button') as HTMLButtonElement;
    this.groundCoverSetInput = document.getElementById('ground-cover-set-input') as HTMLInputElement;

    // Visualizations
    this.showOuterShorelineInput = document.getElementById('show-outer-shoreline-input') as HTMLInputElement;
    this.showCliffEdgeInput = document.getElementById('show-cliff-edge-input') as HTMLInputElement;
    this.showFoliageBoundaryInput = document.getElementById('show-foliage-boundary-input') as HTMLInputElement;
  }

  private addEventListeners() {
    this.rockModelInput.addEventListener('change', this.handleFileSelect.bind(this));
    this.generateButton.addEventListener('click', this.generateIsland.bind(this));
    
    this.foliageModelButton.addEventListener('click', () => this.foliageModelInput.click());
    this.foliageModelInput.addEventListener('change', this.handleFoliageModelSelect.bind(this));

    this.foliageBandWidthInput.addEventListener('input', () => {
        if (this.foliageBandWidthValue) {
            this.foliageBandWidthValue.textContent = parseFloat(this.foliageBandWidthInput.value).toFixed(1);
        }
    });

    // PBR Texture Set Listeners
    this.sandSetButton.addEventListener('click', () => this.sandSetInput.click());
    this.sandSetInput.addEventListener('change', (e) => this.handleTextureSetUpload(
        e,
        this.sandMaterial,
        {
            map: 'sand-albedo-filename',
            normalMap: 'sand-normal-filename',
            roughnessMap: 'sand-roughness-filename',
            aoMap: 'sand-ao-filename',
            displacementMap: 'sand-displacement-filename',
        },
        0xC2B280 // Sand color
    ));

    this.rockSetButton.addEventListener('click', () => this.rockSetInput.click());
    this.rockSetInput.addEventListener('change', (e) => this.handleTextureSetUpload(
        e,
        this.rockMaterial,
        {
            map: 'rock-albedo-filename',
            normalMap: 'rock-normal-filename',
            roughnessMap: 'rock-roughness-filename',
            aoMap: 'rock-ao-filename',
            displacementMap: 'rock-displacement-filename',
        },
        0x808080 // Rock color
    ));
    
    this.groundCoverSetButton.addEventListener('click', () => this.groundCoverSetInput.click());
    this.groundCoverSetInput.addEventListener('change', (e) => this.handleTextureSetUpload(
        e,
        this.groundCoverMaterial,
        {
            map: 'ground-cover-albedo-filename',
            normalMap: 'ground-cover-normal-filename',
            roughnessMap: 'ground-cover-roughness-filename',
            aoMap: 'ground-cover-ao-filename',
            displacementMap: 'ground-cover-displacement-filename',
        },
        0x5C4033 // Dirt brown
    ));

    // Visualization Listeners
    this.showOuterShorelineInput.addEventListener('change', () => {
        if (this.outerContourLine) this.outerContourLine.visible = this.showOuterShorelineInput.checked;
    });
    this.showCliffEdgeInput.addEventListener('change', () => {
        if (this.contourLine) this.contourLine.visible = this.showCliffEdgeInput.checked;
    });
    this.showFoliageBoundaryInput.addEventListener('change', () => {
        if (this.foliageBoundaryLine) this.foliageBoundaryLine.visible = this.showFoliageBoundaryInput.checked;
    });
  }

    private loadTextureFromFile(
        file: File,
        material: THREE.MeshStandardMaterial,
        mapType: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap' | 'displacementMap'
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                if (!dataUrl) {
                    return reject(new Error('Failed to read file data.'));
                }

                const textureLoader = new THREE.TextureLoader();
                textureLoader.load(dataUrl, 
                    (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.needsUpdate = true;

                        material[mapType] = texture;
                        if (mapType === 'map' && material.color) {
                            material.color.set(0xffffff); // Set color to white to show texture fully
                        }
                        material.needsUpdate = true;
                        resolve();
                    },
                    undefined, // onProgress callback
                    (errorEvent) => {
                        const message = `Failed to load texture from file "${file.name}". Please ensure it is a valid image file.`;
                        console.error(message, errorEvent);
                        reject(new Error(message));
                    }
                );
            };
            reader.onerror = (err) => {
                const message = `Error reading file "${file.name}".`;
                console.error(message, err);
                reject(new Error(message));
            };
            reader.readAsDataURL(file);
        });
    }

    private async handleTextureSetUpload(
        event: Event, 
        material: THREE.MeshStandardMaterial, 
        filenameElementsMap: Record<string, string>,
        defaultColor: number
    ) {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        this.showLoading(true, `Loading ${material.name} textures...`);

        const files = Array.from(input.files);

        const mapTypeKeywords: Record<string, string[]> = {
            map: ['albedo', 'diffuse', 'diff', 'col', 'color', 'basecolor'],
            normalMap: ['normal', 'nor', 'nrm'],
            roughnessMap: ['roughness', 'rough'],
            aoMap: ['ao', 'ambientocclusion', 'occlusion'],
            displacementMap: ['displacement', 'disp', 'height']
        };

        const filenameElements: Record<string, HTMLElement | null> = {};
        for (const key in filenameElementsMap) {
            filenameElements[key] = document.getElementById(filenameElementsMap[key]);
        }
        
        // Reset display and material properties
        for (const key in filenameElements) {
            if (filenameElements[key]) {
                filenameElements[key]!.textContent = 'No file chosen';
            }
            (material as any)[key] = null;
        }
        material.color.set(defaultColor);
        material.needsUpdate = true;

        const texturePromises = files.map(file => {
            const lowerCaseName = file.name.toLowerCase();
            let assignedMapType: string | null = null;

            for (const [mapType, keywords] of Object.entries(mapTypeKeywords)) {
                if (keywords.some(keyword => lowerCaseName.includes(keyword))) {
                    assignedMapType = mapType;
                    break;
                }
            }
            
            if (assignedMapType) {
                const el = filenameElements[assignedMapType];
                if (el) {
                    el.textContent = file.name;
                }
                return this.loadTextureFromFile(file, material, assignedMapType as any);
            }
            return Promise.resolve();
        });
        
        try {
            await Promise.all(texturePromises);
        } catch (error) {
            console.error("Error loading texture set:", error);
            const message = error instanceof Error ? error.message : "An error occurred while loading one or more textures. Check the console for details.";
            alert(message);
        } finally {
            this.showLoading(false);
            // Reset input value to allow re-uploading the same file set
            input.value = '';
        }
    }
  
  private async handleFoliageModelSelect(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) {
      this.foliageModels.length = 0; // Clear the array
      this.foliageFileCountDisplay.textContent = 'No files selected.';
      return;
    }
    
    this.showLoading(true, `Loading foliage models...`);
    this.foliageModels.length = 0; // Clear the array before loading new ones
    const loadPromises: Promise<void>[] = [];

    for (const file of files) {
      loadPromises.push(this.loadFoliageFile(file, this.foliageModels));
    }

    try {
      await Promise.all(loadPromises);
    } catch (error) {
      console.error(`Error loading foliage files:`, error);
      alert(`There was an error loading one or more foliage model files. Check the console for details.`);
    } finally {
      this.showLoading(false);
      const numFiles = this.foliageModels.length;
      this.foliageFileCountDisplay.textContent = numFiles > 0 ? `${numFiles} model${numFiles > 1 ? 's' : ''} loaded.` : 'No valid models selected.';
    }
  }

  private loadFoliageFile(file: File, modelArray: FoliageData[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const fileExtension = file.name.split('.').pop()?.toLowerCase();

        reader.onload = (e) => {
            const contents = e.target?.result;
            if (!contents) {
                return reject(new Error(`Failed to read file: ${file.name}`));
            }
            try {
                let object: THREE.Group;
                if (fileExtension === 'obj' && typeof contents === 'string') {
                    object = this.objLoader.parse(contents);
                } else if (fileExtension === 'fbx' && contents instanceof ArrayBuffer) {
                    object = this.fbxLoader.parse(contents, '');
                } else {
                    console.warn(`Skipping file with unsupported type or content mismatch: ${file.name}`);
                    return resolve();
                }

                let hasGeometry = false;
                object.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        hasGeometry = true;
                    }
                });
                if (!hasGeometry) {
                    throw new Error(`Parsed model "${file.name}" contains no usable mesh geometry.`);
                }

                object.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        // Use a shared material instance for performance
                        child.material = this.foliageMaterial;
                        child.castShadow = true;
                    }
                });
                
                modelArray.push({
                    model: object,
                    name: file.name
                });
                resolve();
            } catch (error) {
                const e = error as Error;
                reject(new Error(`Failed to parse ${file.name}: ${e.message}`));
            }
        };
        reader.onerror = (err) => reject(new Error(`Error reading file ${file.name}: ${err}`));
        
        if (fileExtension === 'obj') {
            reader.readAsText(file);
        } else if (fileExtension === 'fbx') {
            reader.readAsArrayBuffer(file);
        } else {
            console.warn(`Skipping unsupported file type: ${file.name}`);
            resolve();
        }
    });
  }

  private async handleFileSelect(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files || files.length === 0) {
      this.rockModels = [];
      this.generateButton.disabled = true;
      this.fileCountDisplay.textContent = 'No files selected.';
      return;
    }
    
    this.showLoading(true, "Loading models...");
    this.rockModels = [];
    const loadPromises: Promise<void>[] = [];

    for (const file of files) {
      loadPromises.push(this.loadFile(file));
    }

    try {
      await Promise.all(loadPromises);
    } catch (error) {
      console.error('Error loading files:', error);
      alert('There was an error loading one or more model files. Check the console for details.');
    } finally {
      this.showLoading(false);
      const numFiles = this.rockModels.length;
      this.fileCountDisplay.textContent = numFiles > 0 ? `${numFiles} model${numFiles > 1 ? 's' : ''} loaded.` : 'No valid models selected.';
      this.generateButton.disabled = numFiles === 0;
    }
  }

  private loadFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const fileExtension = file.name.split('.').pop()?.toLowerCase();

        reader.onload = (e) => {
            const contents = e.target?.result;
            if (!contents) {
                return reject(new Error(`Failed to read file: ${file.name}`));
            }
            try {
                let object: THREE.Group;
                if (fileExtension === 'obj' && typeof contents === 'string') {
                    object = this.objLoader.parse(contents);
                } else if (fileExtension === 'fbx' && contents instanceof ArrayBuffer) {
                    object = this.fbxLoader.parse(contents, '');
                } else {
                    // This path should ideally not be taken due to the check below,
                    // but it's a safeguard.
                    console.warn(`Skipping file with unsupported type or content mismatch: ${file.name}`);
                    return resolve();
                }

                let hasGeometry = false;
                object.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        hasGeometry = true;
                    }
                });
                if (!hasGeometry) {
                    throw new Error(`Parsed model "${file.name}" contains no usable mesh geometry.`);
                }

                const box = new THREE.Box3().setFromObject(object);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                // Apply the current rock material (default color or user-uploaded)
                object.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.material = this.rockMaterial;
                        if (child.geometry.attributes.uv && !child.geometry.attributes.uv2) {
                            child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
                        }
                    }
                });
                
                this.rockModels.push({
                    model: object,
                    name: file.name,
                    size: size,
                    box: box,
                });
                resolve();
            } catch (error) {
                const e = error as Error;
                reject(new Error(`Failed to parse ${file.name}: ${e.message}`));
            }
        };
        reader.onerror = (err) => reject(new Error(`Error reading file ${file.name}: ${err}`));
        
        if (fileExtension === 'obj') {
            reader.readAsText(file);
        } else if (fileExtension === 'fbx') {
            reader.readAsArrayBuffer(file);
        } else {
            console.warn(`Skipping unsupported file type: ${file.name}`);
            resolve(); // Don't block other files from loading
        }
    });
  }
  
  /**
   * Generates a set of noise values for creating natural contours.
   * @param numPoints The number of noise values to generate.
   * @param phaseOffset A random offset to change the starting point of the noise.
   * @returns An array of normalized noise values.
   */
  private generateNoise(numPoints: number, phaseOffset: number): number[] {
      const noiseValues = new Array(numPoints).fill(0);
      const harmonics = [
          { freq: 1, amp: 1.0 },   // Base shape
          { freq: 2, amp: 0.5 },   // Medium details
          { freq: 5, amp: 0.25 },  // Finer details
          { freq: 9, amp: 0.125 }, // Very fine details
      ];

      let totalAmplitude = 0;
      harmonics.forEach(h => totalAmplitude += h.amp);

      for (const harmonic of harmonics) {
          const phase = phaseOffset + Math.random() * 2 * Math.PI;
          for (let i = 0; i < numPoints; i++) {
              const angle = (i / numPoints) * 2 * Math.PI;
              noiseValues[i] += Math.sin(angle * harmonic.freq + phase) * harmonic.amp;
          }
      }
      
      // Normalize to ensure the output is roughly within [-1, 1] for consistent irregularity
      for (let i = 0; i < numPoints; i++) {
          noiseValues[i] /= totalAmplitude;
      }

      return noiseValues;
  }

  /**
   * Applies a Simple Moving Average to the Y-values of a set of points.
   * @param points The input points.
   * @param windowSize The number of neighbors on each side to include in the average.
   * @returns A new array of points with smoothed Y-values.
   */
  private applySMA(points: THREE.Vector3[], windowSize: number): THREE.Vector3[] {
    if (windowSize === 0) {
        return points.map(p => p.clone()); // Return a copy if no smoothing
    }

    const smoothedPoints: THREE.Vector3[] = [];
    const numPoints = points.length;

    for (let i = 0; i < numPoints; i++) {
        let sumY = 0;
        let count = 0;
        for (let j = -windowSize; j <= windowSize; j++) {
            const index = (i + j + numPoints) % numPoints; // Wrap around for a closed loop
            sumY += points[index].y;
            count++;
        }
        
        const newPoint = points[i].clone();
        newPoint.y = sumY / count;
        smoothedPoints.push(newPoint);
    }

    return smoothedPoints;
  }

  private disposeAllGeneratedObjects() {
    // Helper to dispose of geometries within a group, as materials are shared
    const disposeGroupGeometries = (group: THREE.Group) => {
        group.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
            }
        });
        group.clear();
    };

    // Dispose lines, which have unique materials
    if (this.contourLine) {
        this.scene.remove(this.contourLine);
        this.contourLine.geometry.dispose();
        (this.contourLine.material as THREE.Material).dispose();
    }
    if (this.foliageBoundaryLine) {
        this.scene.remove(this.foliageBoundaryLine);
        this.foliageBoundaryLine.geometry.dispose();
        (this.foliageBoundaryLine.material as THREE.Material).dispose();
    }
    if (this.outerContourLine) {
        this.scene.remove(this.outerContourLine);
        this.outerContourLine.geometry.dispose();
        (this.outerContourLine.material as THREE.Material).dispose();
    }
    
    // Dispose geometries from the main groups
    disposeGroupGeometries(this.group);
    disposeGroupGeometries(this.foliageGroup);
    disposeGroupGeometries(this.pathGroup);
    disposeGroupGeometries(this.waterGroup);
    this.riverMeshes = [];
    
    // Nullify references
    this.contourLine = null;
    this.foliageBoundaryLine = null;
    this.outerContourLine = null;
    this.islandSurface = null;
    this.groundCoverMesh = null;
  }

  private async generateIsland() {
    if (this.rockModels.length === 0) return;

    this.showLoading(true, "Generating Island...");
    this.generateButton.disabled = true;
    if (this.foliageCoordinatesList) {
        this.foliageCoordinatesList.textContent = 'Cleared. Waiting for generation...';
    }
    await new Promise(resolve => setTimeout(resolve, 20));

    try {
        this.disposeAllGeneratedObjects();

        const baseRadius = parseFloat(this.islandRadiusInput.value);
        const shorelineOffset = parseFloat(this.shorelineOffsetInput.value);
        const shorelineHeight = parseFloat(this.shorelineHeightInput.value);
        const baseHeight = parseFloat(this.contourHeightInput.value);
        const noiseStrength = parseFloat(this.noiseStrengthInput.value);
        const noiseScale = parseFloat(this.noiseScaleInput.value);
        const surfaceSmoothing = parseInt(this.surfaceSmoothingInput.value, 10);
        const rockHeightScale = parseFloat(this.rockHeightScaleInput.value);
        const foliageBandWidth = parseFloat(this.foliageBandWidthInput.value);
        
        // Sort models by size (volume of bounding box) to partition them.
        this.rockModels.sort((a, b) => {
            const volumeA = a.size.x * a.size.y * a.size.z;
            const volumeB = b.size.x * b.size.y * b.size.z;
            return volumeA - volumeB;
        });

        // Split models into "small" and "large" sets.
        const SMALL_ROCK_PERCENTILE = 0.4;
        let splitIndex = Math.max(1, Math.floor(this.rockModels.length * SMALL_ROCK_PERCENTILE));
        if (this.rockModels.length < 2) splitIndex = 1;

        const smallRockModels = this.rockModels.slice(0, splitIndex);
        let largeRockModels = this.rockModels.slice(splitIndex);

        // Ensure largeRockModels is never empty if we have models.
        if (largeRockModels.length === 0 && smallRockModels.length > 0) {
            largeRockModels = smallRockModels;
        }

        const irregularity = 0.25;
        const DENSITY_BASE_ROCKS = 75;
        const DENSITY_BASE_RADIUS = 20;
        const DENSITY_SCALE_POWER = 1;
        const densityCoefficient = DENSITY_BASE_ROCKS / Math.pow(DENSITY_BASE_RADIUS, DENSITY_SCALE_POWER);

        // --- Generate Large Rock Contour (Inner) ---
        const numLargeRocks = Math.max(3, Math.round(densityCoefficient * Math.pow(baseRadius, DENSITY_SCALE_POWER)));
        const largeRocksGroup = new THREE.Group();
        const innerContourData: ContourPoint[] = [];
        
        const largeRockClones = Array.from({ length: numLargeRocks }, (_, i) => {
            const source = largeRockModels[i % largeRockModels.length];
            return { ...source, model: source.model.clone(true) };
        }).sort(() => Math.random() - 0.5); // Shuffle

        const largeNoise = this.generateNoise(numLargeRocks, Math.random());

        for (let i = 0; i < numLargeRocks; i++) {
            const data = largeRockClones[i];
            const { model, box } = data;
            const angle = (i / numLargeRocks) * 2 * Math.PI;
            
            const noisyRadius = baseRadius * (1 + largeNoise[i] * irregularity);
            const x = Math.cos(angle) * noisyRadius;
            const z = Math.sin(angle) * noisyRadius;

            // Base position for shoreline calculation remains at y=0.
            const position = new THREE.Vector3(x, 0, z);
            const normal = new THREE.Vector3(x, 0, z).normalize();
            innerContourData.push({ position, normal, angle });
            
            model.scale.y = rockHeightScale;
            // Position the rock's base at y=0
            model.position.set(x, -box.min.y * rockHeightScale, z);
            
            // Orient the rock to be tangential to the new ellipse shape
            const normalAngle = Math.atan2(z, x);
            model.rotation.y = -normalAngle + Math.PI / 2;

            // Re-apply the shared material to ensure texture updates are reflected
            model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = this.rockMaterial;
                }
            });

            largeRocksGroup.add(model);
        }
        this.group.add(largeRocksGroup);
        
        // --- Generate Surface Contour From Large Rock Placement ---
        const noisyContourPoints: THREE.Vector3[] = [];
        const numSurfacePoints = 128; // Higher resolution for a smoother surface boundary

        // Create a smooth curve from the discrete rock positions to define the island edge
        const rockPositions = innerContourData.map(p => p.position);
        const rockContourCurve = new THREE.CatmullRomCurve3(rockPositions, true);
        const surfaceContourPointsXZ = rockContourCurve.getPoints(numSurfacePoints);

        for (const point of surfaceContourPointsXZ) {
            const x = point.x;
            const z = point.z;
            
            // Calculate height based on the base height and Perlin noise.
            // This makes the island surface inside the rocks follow the noise parameters.
            const noiseVal = this.perlin.noise(x * noiseScale, z * noiseScale, 0);
            const y = baseHeight + noiseVal * noiseStrength;

            noisyContourPoints.push(new THREE.Vector3(x, y, z));
        }

        // --- Smooth the noise on the contour points ---
        const smoothedNoisePoints = this.applySMA(noisyContourPoints, surfaceSmoothing);
        
        // --- Smooth the contour shape for the main island mesh (cyan line) ---
        const curve = new THREE.CatmullRomCurve3(smoothedNoisePoints, true);
        const contourPointsForLine = curve.getPoints(numSurfacePoints * 2);
        
        let maxSurfaceY = 0;
        for (const point of contourPointsForLine) {
            maxSurfaceY = Math.max(maxSurfaceY, point.y);
        }


        // --- Generate Small Rock Contour (Outer) ---
        const outerRadius = baseRadius + shorelineOffset;
        const numSmallRocks = Math.max(3, Math.round(densityCoefficient * Math.pow(outerRadius, DENSITY_SCALE_POWER)));
        const smallRocksGroup = new THREE.Group();

        const smallRockClones = Array.from({ length: numSmallRocks }, (_, i) => {
            const source = smallRockModels[i % smallRockModels.length];
            return { ...source, model: source.model.clone(true) };
        }).sort(() => Math.random() - 0.5); // Shuffle

        const smallNoise = this.generateNoise(numSmallRocks, Math.random() + Math.PI); // Offset phase for variation
        const OFFSET_IRREGULARITY = 0.5; // How much the shoreline offset varies.

        for (let i = 0; i < numSmallRocks; i++) {
            const data = smallRockClones[i];
            const { model, box } = data;

            // Find a corresponding point on the inner contour to offset from.
            const progress = i / numSmallRocks;
            const innerIndexFloat = progress * numLargeRocks;
            const index1 = Math.floor(innerIndexFloat);
            const index2 = (index1 + 1) % numLargeRocks; // Loop back to the start
            const lerpFactor = innerIndexFloat - index1;

            const data1 = innerContourData[index1];
            const data2 = innerContourData[index2];

            // Interpolate position and normal from the inner contour to create a smooth base.
            const basePosition = data1.position.clone().lerp(data2.position, lerpFactor);
            const baseNormal = data1.normal.clone().lerp(data2.normal, lerpFactor).normalize();

            // Apply a noisy offset to the base shoreline distance.
            const noisyOffset = shorelineOffset * (1 + smallNoise[i] * OFFSET_IRREGULARITY);

            // Calculate the final position by pushing the base point out along its normal.
            const finalPosition = basePosition.clone().add(baseNormal.multiplyScalar(noisyOffset));

            model.scale.y = rockHeightScale;
            model.position.set(finalPosition.x, -box.min.y * rockHeightScale, finalPosition.z);
            
            // Orient the rock to be perpendicular to the line from the origin (tangential to the island).
            const finalAngle = Math.atan2(finalPosition.z, finalPosition.x);
            model.rotation.y = -finalAngle + Math.PI / 2;
            
            // Re-apply the shared material to ensure texture updates are reflected
            model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = this.rockMaterial;
                }
            });

            smallRocksGroup.add(model);
        }
        this.group.add(smallRocksGroup);
        
        // --- Raycasting setup for shoreline height ---
        const raycaster = new THREE.Raycaster();
        const rockMeshes: THREE.Mesh[] = [];
        this.group.traverse(child => {
            if (child instanceof THREE.Mesh) {
                rockMeshes.push(child);
            }
        });

        /**
         * Gets the terrain height at a specific XZ coordinate by raycasting down.
         * @param x The x-coordinate.
         * @param z The z-coordinate.
         * @param fallbackHeight The height to return if no terrain is hit.
         * @returns The height of the terrain or the fallback height.
         */
        const getTerrainHeight = (x: number, z: number, fallbackHeight: number): number => {
            const origin = new THREE.Vector3(x, 100, z); // Start ray from high above
            const direction = new THREE.Vector3(0, -1, 0);
            raycaster.set(origin, direction);
            
            const intersects = raycaster.intersectObjects(rockMeshes, true);
            
            if (intersects.length > 0) {
                // The shoreline should not go below the specified shorelineHeight
                return Math.max(intersects[0].point.y, fallbackHeight);
            }
            
            return fallbackHeight;
        };


        // --- Generate Outer Contour Line (Shoreline Base) ---
        const outerContourPoints: THREE.Vector3[] = [];
        const numOuterContourPoints = 128; // Use more points for a smoother line than the rocks themselves.

        for (let i = 0; i < numOuterContourPoints; i++) {
            const progress = i / numOuterContourPoints;

            // Interpolate from inner contour data
            const innerIndexFloat = progress * numLargeRocks;
            const index1 = Math.floor(innerIndexFloat);
            const index2 = (index1 + 1) % numLargeRocks;
            const lerpFactor = innerIndexFloat - index1;

            const data1 = innerContourData[index1];
            const data2 = innerContourData[index2];

            const basePosition = data1.position.clone().lerp(data2.position, lerpFactor);
            const baseNormal = data1.normal.clone().lerp(data2.normal, lerpFactor).normalize();

            // Interpolate from small rock noise data to get consistent irregularity
            const noiseProgress = progress * numSmallRocks;
            const noiseIndex1 = Math.floor(noiseProgress);
            const noiseIndex2 = (noiseIndex1 + 1) % numSmallRocks;
            const noiseLerpFactor = noiseProgress - noiseIndex1;
            const interpolatedNoise = THREE.MathUtils.lerp(smallNoise[noiseIndex1], smallNoise[noiseIndex2], noiseLerpFactor);

            const noisyOffset = shorelineOffset * (1 + interpolatedNoise * OFFSET_IRREGULARITY);

            const finalPosition = basePosition.clone().add(baseNormal.multiplyScalar(noisyOffset));
            finalPosition.y = getTerrainHeight(finalPosition.x, finalPosition.z, shorelineHeight);
            outerContourPoints.push(finalPosition);
        }

        const outerCurve = new THREE.CatmullRomCurve3(outerContourPoints, true);
        const outerCurvePoints = outerCurve.getPoints(256); // Even more points for a very smooth line

        const outerContourGeometry = new THREE.BufferGeometry().setFromPoints(outerCurvePoints);
        const outerContourMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 }); // Red
        this.outerContourLine = new THREE.LineLoop(outerContourGeometry, outerContourMaterial);
        this.outerContourLine.visible = this.showOuterShorelineInput.checked;
        this.scene.add(this.outerContourLine);

        // --- Main Surface and Ground Cover Generation ---
        const topContourVertices = contourPointsForLine[contourPointsForLine.length - 1].equals(contourPointsForLine[0])
            ? contourPointsForLine.slice(0, -1)
            : contourPointsForLine;

        if (topContourVertices.length > 2) {
            // Find center point (XZ) of the contour
            const centerXZ = new THREE.Vector2(0, 0);
            smoothedNoisePoints.forEach(p => {
                centerXZ.add(new THREE.Vector2(p.x, p.z));
            });
            centerXZ.divideScalar(smoothedNoisePoints.length);
            
            // Calculate center height from noise to match the rest of the surface
            const centerNoise = this.perlin.noise(centerXZ.x * noiseScale, centerXZ.y * noiseScale, 0);
            const centerHeight = baseHeight + centerNoise * noiseStrength;
            const centerPoint = new THREE.Vector3(centerXZ.x, centerHeight, centerXZ.y);

            // --- Generate Inner Foliage Boundary Contour (Green Line) ---
            const innerFoliageBoundaryPoints: THREE.Vector3[] = [];
            const offsetDistance = foliageBandWidth;

            const polygonVertices = contourPointsForLine;
            const numPolygonVertices = polygonVertices.length;
            for (let i = 0; i < numPolygonVertices; i++) {
                const p_curr = polygonVertices[i];
                
                // Simplified radial offset logic to prevent self-intersection
                const pointXZ = new THREE.Vector2(p_curr.x, p_curr.z);
                const direction = pointXZ.clone().sub(centerXZ);
                const originalDistance = direction.length();
                
                const newDistance = Math.max(0, originalDistance - offsetDistance);
                direction.normalize(); // Use the direction before changing length
                
                const newPointXZ = centerXZ.clone().add(direction.multiplyScalar(newDistance));
                
                // Interpolate height based on the point's new radial distance from the center.
                const heightLerpFactor = (originalDistance > 0.0001) ? (newDistance / originalDistance) : 0;
                const newY = THREE.MathUtils.lerp(centerPoint.y, p_curr.y, heightLerpFactor);
                
                innerFoliageBoundaryPoints.push(new THREE.Vector3(newPointXZ.x, newY, newPointXZ.y));
            }

            if (innerFoliageBoundaryPoints.length > 2) {
                const foliageBoundaryGeometry = new THREE.BufferGeometry().setFromPoints(innerFoliageBoundaryPoints);
                const foliageBoundaryMaterial = new THREE.LineBasicMaterial({ color: 0x34c759 }); // Green
                this.foliageBoundaryLine = new THREE.LineLoop(foliageBoundaryGeometry, foliageBoundaryMaterial);
                this.foliageBoundaryLine.visible = this.showFoliageBoundaryInput.checked;
                this.scene.add(this.foliageBoundaryLine);
            }
            
            // --- Water Feature Pre-calculation ---
            const lakes: Lake[] = [];
            if (this.waterFeaturesToggle.checked) {
                const numLakes = parseInt(this.numLakesInput.value, 10);
                const lakeRadius = parseFloat(this.lakeRadiusInput.value);
                const lakeDepth = parseFloat(this.lakeDepthInput.value);

                // Define a bounding box for lake placement *only* within the sand area (inside innerFoliageBoundaryPoints)
                const sandAreaBox = new THREE.Box2();
                const tempVec2 = new THREE.Vector2();
                innerFoliageBoundaryPoints.forEach(v => sandAreaBox.expandByPoint(tempVec2.set(v.x, v.z)));


                for (let i = 0; i < numLakes; i++) {
                    let lakeCenter: THREE.Vector2 | null = null;
                    const maxAttempts = 100; // Prevent infinite loops
                    for (let attempt = 0; attempt < maxAttempts; attempt++) {
                        // Generate a random point within the bounding box of the sand area
                        const randomCenter = new THREE.Vector2(
                            THREE.MathUtils.randFloat(sandAreaBox.min.x + lakeRadius, sandAreaBox.max.x - lakeRadius),
                            THREE.MathUtils.randFloat(sandAreaBox.min.y + lakeRadius, sandAreaBox.max.y - lakeRadius)
                        );
                        
                        // Ensure the point is inside the actual sand polygon, not just the bounding box
                        if (this.isPointInPolygon(randomCenter, innerFoliageBoundaryPoints)) {
                            lakeCenter = randomCenter;
                            break; // Found a valid spot
                        }
                    }
                    
                    if (!lakeCenter) {
                        console.warn("Could not find a valid position for a lake within the sand area after multiple attempts.");
                        continue; // Skip this lake
                    }
                    
                    // Calculate original terrain height at the center before depressing it
                    const originalCenterNoise = this.perlin.noise(lakeCenter.x * noiseScale, lakeCenter.y * noiseScale, 0);
                    const originalCenterHeight = baseHeight + originalCenterNoise * noiseStrength;

                    lakes.push({
                        center: lakeCenter,
                        radius: lakeRadius,
                        depth: lakeDepth,
                        waterLevel: originalCenterHeight - lakeDepth + (lakeDepth * 0.5) // Fill lake halfway
                    });
                }
            }


            // --- Unify Mesh Boundaries to Prevent Seams ---
            const MESH_BOUNDARY_RESOLUTION = 256;
            const innerCurve = new THREE.CatmullRomCurve3(innerFoliageBoundaryPoints, true);
            const boundaryPoints = innerCurve.getPoints(MESH_BOUNDARY_RESOLUTION);
            
            const cliffEdgeCurve = new THREE.CatmullRomCurve3(topContourVertices, true);
            const shorelinePointsForMesh = cliffEdgeCurve.getPoints(MESH_BOUNDARY_RESOLUTION);

            const groundCoverExtension = 0.0;
            const extendedShorelinePoints = shorelinePointsForMesh.map(p => {
                const pointXZ = new THREE.Vector2(p.x, p.z);
                const direction = pointXZ.clone().sub(centerXZ).normalize();
                const newPointXZ = pointXZ.clone().add(direction.multiplyScalar(groundCoverExtension));
                const y = getTerrainHeight(newPointXZ.x, newPointXZ.y, shorelineHeight);
                return new THREE.Vector3(newPointXZ.x, y, newPointXZ.y);
            });

            let groundCoverGeometry: THREE.BufferGeometry | null = null;
            this.groundCoverMesh = null;
            this.islandSurface = null;

            // --- Generate Ground Cover Geometry Data ---
            if (boundaryPoints.length > 2 && shorelinePointsForMesh.length > 2) {
                const uniqueBoundaryPoints = boundaryPoints.slice(0, -1);
                const uniqueExtendedShorelinePoints = extendedShorelinePoints.slice(0, -1);
                const numSegments = uniqueBoundaryPoints.length;

                if (numSegments > 0) {
                    const groundCoverVertices: number[] = [];
                    const groundCoverIndices: number[] = [];
                    const numRings = 32;

                    const gridIndices: number[][] = Array(numRings + 1).fill(0).map(() => Array(numSegments));
                    let vertexIndex = 0;

                    for (let r = 0; r <= numRings; r++) {
                        const ringLerp = r / numRings;
                        for (let s = 0; s < numSegments; s++) {
                            const outerPoint = uniqueExtendedShorelinePoints[s];
                            const innerPoint = uniqueBoundaryPoints[s];
                            const point = outerPoint.clone().lerp(innerPoint, ringLerp);
                            
                            // Apply lake depression
                            const point2D = new THREE.Vector2(point.x, point.z);
                            let finalY = point.y;
                            lakes.forEach(lake => {
                                const dist = point2D.distanceTo(lake.center);
                                if (dist < lake.radius) {
                                    const influence = 1.0 - THREE.MathUtils.smoothstep(dist, 0, lake.radius);
                                    finalY -= lake.depth * influence;
                                }
                            });
                            
                            groundCoverVertices.push(point.x, finalY, point.z);
                            gridIndices[r][s] = vertexIndex++;
                        }
                    }
                    
                    const skirtBottomStartIndex = vertexIndex;
                    uniqueExtendedShorelinePoints.forEach(p => {
                        groundCoverVertices.push(p.x, 0, p.z);
                    });

                    for (let r = 0; r < numRings; r++) {
                        for (let s = 0; s < numSegments; s++) {
                            const next_s = (s + 1) % numSegments;
                            const i_tl = gridIndices[r][s];
                            const i_tr = gridIndices[r][next_s];
                            const i_bl = gridIndices[r + 1][s];
                            const i_br = gridIndices[r + 1][next_s];
                            groundCoverIndices.push(i_tl, i_bl, i_br);
                            groundCoverIndices.push(i_tl, i_br, i_tr);
                        }
                    }
                    
                    for (let s = 0; s < numSegments; s++) {
                        const next_s = (s + 1) % numSegments;
                        const top_curr = gridIndices[0][s];
                        const top_next = gridIndices[0][next_s];
                        const bottom_curr = skirtBottomStartIndex + s;
                        const bottom_next = skirtBottomStartIndex + next_s;
                        groundCoverIndices.push(top_curr, top_next, bottom_next);
                        groundCoverIndices.push(top_curr, bottom_next, bottom_curr);
                    }
    
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(groundCoverVertices, 3));
                    geo.setIndex(groundCoverIndices);
    
                    const TEXTURE_SCALE = 20.0;
                    const CIRCUMFERENCE_TEXTURE_REPEATS = (2 * Math.PI * baseRadius) / TEXTURE_SCALE;
                    const groundCoverUVs: number[] = [];
                    const positions = geo.attributes.position.array;
                    
                    geo.computeVertexNormals(); // Temporarily compute for UV blending
                    const normals = geo.attributes.normal.array;

                    for (let i = 0; i < positions.length / 3; i++) {
                        const x = positions[i * 3 + 0];
                        const y = positions[i * 3 + 1];
                        const z = positions[i * 3 + 2];
                        const uTop = x / TEXTURE_SCALE;
                        const vTop = z / TEXTURE_SCALE;
                        const angle = Math.atan2(z - centerXZ.y, x - centerXZ.x);
                        const uSide = (angle / (2 * Math.PI) + 0.5) * CIRCUMFERENCE_TEXTURE_REPEATS;
                        const vSide = y / TEXTURE_SCALE;
                        const normalY = Math.abs(normals[i * 3 + 1]);
                        const topDownWeight = Math.pow(normalY, 4.0);
                        const finalU = uTop * topDownWeight + uSide * (1.0 - topDownWeight);
                        const finalV = vTop * topDownWeight + vSide * (1.0 - topDownWeight);
                        groundCoverUVs.push(finalU, finalV);
                    }
    
                    geo.setAttribute('uv', new THREE.Float32BufferAttribute(groundCoverUVs, 2));
                    geo.setAttribute('uv2', new THREE.Float32BufferAttribute(groundCoverUVs, 2));
                    this.groundCoverMaterial.side = THREE.DoubleSide;
                    groundCoverGeometry = geo;
                }
            }
            
            // --- Generate Central Island Surface Geometry Data ---
            const centralContourVertices = boundaryPoints.slice(0, -1);
            const vertices: number[] = [];
            const indices: number[] = [];
            const numSegments = centralContourVertices.length;
            const numRings = 60;
            let vertexIndex = 0;
            const gridIndices: number[][] = Array(numRings).fill(0).map(() => Array(numSegments));
            vertices.push(centerPoint.x, centerPoint.y, centerPoint.z);
            vertexIndex++;

            for (let r = 0; r < numRings; r++) {
                const t = (r + 1) / (numRings + 1);
                const ringLerp = 1 - Math.pow(1 - t, 2);
                for (let s = 0; s < numSegments; s++) {
                    const edgePoint = centralContourVertices[s];
                    const basePointXZ = new THREE.Vector2(centerPoint.x, centerPoint.z).lerp(new THREE.Vector2(edgePoint.x, edgePoint.z), ringLerp);
                    const noiseVal = this.perlin.noise(basePointXZ.x * noiseScale, basePointXZ.y * noiseScale, 0);
                    const pointY = baseHeight + noiseVal * noiseStrength;
                    const interpolatedContourY = THREE.MathUtils.lerp(centerPoint.y, edgePoint.y, ringLerp);
                    const blendFactor = Math.pow(ringLerp, 2);
                    let finalY = THREE.MathUtils.lerp(pointY, interpolatedContourY, blendFactor);
                    
                    // Apply lake depression
                    lakes.forEach(lake => {
                        const dist = basePointXZ.distanceTo(lake.center);
                        if (dist < lake.radius) {
                            const influence = 1.0 - THREE.MathUtils.smoothstep(dist, 0, lake.radius);
                            finalY -= lake.depth * influence;
                        }
                    });

                    vertices.push(basePointXZ.x, finalY, basePointXZ.y);
                    gridIndices[r][s] = vertexIndex++;
                }
            }

            const contourIndices: number[] = [];
            for(const p of centralContourVertices) {
                contourIndices.push(vertexIndex++);
                let finalY = p.y;
                 // Apply lake depression to contour points as well
                const point2D = new THREE.Vector2(p.x, p.z);
                 lakes.forEach(lake => {
                    const dist = point2D.distanceTo(lake.center);
                    if (dist < lake.radius) {
                        const influence = 1.0 - THREE.MathUtils.smoothstep(dist, 0, lake.radius);
                        finalY -= lake.depth * influence;
                    }
                });
                vertices.push(p.x, finalY, p.z);
            }
            
            const bottomSkirtStartIndex = vertexIndex;
            for(const p of centralContourVertices) {
                vertices.push(p.x, 0, p.z);
            }

            for (let s = 0; s < numSegments; s++) {
                indices.push(0, gridIndices[0][s], gridIndices[0][(s + 1) % numSegments]);
            }
            for (let r = 0; r < numRings - 1; r++) {
                for (let s = 0; s < numSegments; s++) {
                    const next_s = (s + 1) % numSegments;
                    indices.push(gridIndices[r][s], gridIndices[r][next_s], gridIndices[r + 1][next_s]);
                    indices.push(gridIndices[r][s], gridIndices[r + 1][next_s], gridIndices[r + 1][s]);
                }
            }
            const lastRingIndex = numRings - 1;
            for (let s = 0; s < numSegments; s++) {
                const next_s = (s + 1) % numSegments;
                indices.push(gridIndices[lastRingIndex][s], gridIndices[lastRingIndex][next_s], contourIndices[next_s]);
                indices.push(gridIndices[lastRingIndex][s], contourIndices[next_s], contourIndices[s]);
            }
            for (let s = 0; s < numSegments; s++) {
                const next_s = (s + 1) % numSegments;
                indices.push(contourIndices[s], contourIndices[next_s], bottomSkirtStartIndex + next_s);
                indices.push(contourIndices[s], bottomSkirtStartIndex + next_s, bottomSkirtStartIndex + s);
            }

            const surfaceGeometry = new THREE.BufferGeometry();
            surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            surfaceGeometry.setIndex(indices);
            
            const TEXTURE_SCALE = 20.0;
            const CIRCUMFERENCE_TEXTURE_REPEATS = (2 * Math.PI * baseRadius) / TEXTURE_SCALE;
            const uvs: number[] = [];
            
            surfaceGeometry.computeVertexNormals(); // Temporarily compute for UV blending
            const positions = surfaceGeometry.attributes.position.array;
            const normals = surfaceGeometry.attributes.normal.array;

            for (let i = 0; i < positions.length / 3; i++) {
                const x = positions[i * 3 + 0];
                const y = positions[i * 3 + 1];
                const z = positions[i * 3 + 2];
                const uTop = x / TEXTURE_SCALE;
                const vTop = z / TEXTURE_SCALE;
                const angle = Math.atan2(z - centerPoint.z, x - centerPoint.x);
                const uSide = (angle / (2 * Math.PI) + 0.5) * CIRCUMFERENCE_TEXTURE_REPEATS;
                const vSide = y / TEXTURE_SCALE;
                const normalY = Math.abs(normals[i * 3 + 1]);
                const topDownWeight = Math.pow(normalY, 4.0);
                const finalU = uTop * topDownWeight + uSide * (1.0 - topDownWeight);
                const finalV = vTop * topDownWeight + vSide * (1.0 - topDownWeight);
                uvs.push(finalU, finalV);
            }

            surfaceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            surfaceGeometry.setAttribute('uv2', new THREE.Float32BufferAttribute(uvs, 2));

            // --- Merge Geometries and Create Final Mesh ---
            if (groundCoverGeometry) {
                const groundGeo = groundCoverGeometry;
                const sandGeo = surfaceGeometry;

                const groundPositions = groundGeo.attributes.position.array as Float32Array;
                const groundUvs = groundGeo.attributes.uv.array as Float32Array;
                const groundUv2s = groundGeo.attributes.uv2.array as Float32Array;
                const groundIndices = groundGeo.index.array as Uint16Array | Uint32Array;

                const sandPositions = sandGeo.attributes.position.array as Float32Array;
                const sandUvs = sandGeo.attributes.uv.array as Float32Array;
                const sandUv2s = sandGeo.attributes.uv2.array as Float32Array;
                const sandIndices = sandGeo.index.array as Uint16Array | Uint32Array;

                const mergedPositions = new Float32Array(groundPositions.length + sandPositions.length);
                mergedPositions.set(groundPositions, 0);
                mergedPositions.set(sandPositions, groundPositions.length);

                const mergedUvs = new Float32Array(groundUvs.length + sandUvs.length);
                mergedUvs.set(groundUvs, 0);
                mergedUvs.set(sandUvs, groundUvs.length);
                
                const mergedUv2s = new Float32Array(groundUv2s.length + sandUv2s.length);
                mergedUv2s.set(groundUv2s, 0);
                mergedUv2s.set(sandUv2s, groundUv2s.length);

                const vertexOffset = groundPositions.length / 3;
                const mergedIndices = new Uint32Array(groundIndices.length + sandIndices.length);
                mergedIndices.set(groundIndices, 0);
                for (let i = 0; i < sandIndices.length; i++) {
                    mergedIndices[i + groundIndices.length] = sandIndices[i] + vertexOffset;
                }

                const mergedGeometry = new THREE.BufferGeometry();
                mergedGeometry.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
                mergedGeometry.setAttribute('uv', new THREE.BufferAttribute(mergedUvs, 2));
                mergedGeometry.setAttribute('uv2', new THREE.BufferAttribute(mergedUv2s, 2));
                mergedGeometry.setIndex(new THREE.BufferAttribute(mergedIndices, 1));

                mergedGeometry.addGroup(0, groundIndices.length, 0);
                mergedGeometry.addGroup(groundIndices.length, sandIndices.length, 1);

                mergedGeometry.computeVertexNormals();
                mergedGeometry.computeTangents();

                const terrainMesh = new THREE.Mesh(mergedGeometry, [this.groundCoverMaterial, this.sandMaterial]);
                this.group.add(terrainMesh);
                
                this.groundCoverMesh = terrainMesh;
                this.islandSurface = terrainMesh;
            } else {
                // Fallback if no ground cover was generated
                surfaceGeometry.computeTangents();
                this.islandSurface = new THREE.Mesh(surfaceGeometry, this.sandMaterial);
                this.group.add(this.islandSurface);
            }

            this.generateFoliage(contourPointsForLine, innerFoliageBoundaryPoints, this.islandSurface);
            this.generateWaterFeatures(lakes);
            this.generateGraphPaths(this.islandSurface, innerFoliageBoundaryPoints);
        }

        // --- Finalize Scene ---
        const geometry = new THREE.BufferGeometry().setFromPoints(contourPointsForLine);
        const material = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
        this.contourLine = new THREE.LineLoop(geometry, material);
        this.contourLine.visible = this.showCliffEdgeInput.checked;
        this.scene.add(this.contourLine);
        
        this.controls.target.set(0, maxSurfaceY / 2, 0);

        const tanFovY2 = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
        const tanFovX2 = tanFovY2 * this.camera.aspect;

        const islandDiameter = (baseRadius + shorelineOffset) * 2;
        const distForWidth = islandDiameter / (2 * tanFovX2);
        const distForDepth = islandDiameter / (2 * tanFovY2);
        const cameraZ = Math.max(distForWidth, distForDepth) * 1.4;

        this.camera.position.set(0, cameraZ * 0.5, cameraZ);
        this.controls.update();

    } catch(e) {
        console.error("Failed to generate island:", e);
        alert("An error occurred during generation. Please check the console.");
    } finally {
        this.showLoading(false);
        this.generateButton.disabled = this.rockModels.length === 0;
    }
  }

  private isPointInPolygon(point: THREE.Vector2, polygon: THREE.Vector3[]): boolean {
    let isInside = false;
    const x = point.x, y = point.y;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, zi = polygon[i].z;
        const xj = polygon[j].x, zj = polygon[j].z;

        const intersect = ((zi > y) !== (zj > y))
            && (x < (xj - xi) * (y - zi) / (zj - zi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
  }
  
    // =================================================================================
    // PATH GENERATION
    // =================================================================================
    
    private createSurfacePath(
        startPoint: THREE.Vector3,
        endPoint: THREE.Vector3,
        targetMesh: THREE.Mesh,
        raycaster: THREE.Raycaster,
        down: THREE.Vector3,
        stepLength: number
    ): { path: THREE.Vector3[], normals: THREE.Vector3[] } {
        const path: THREE.Vector3[] = [startPoint.clone()];
        const normals: THREE.Vector3[] = [];
        
        raycaster.set(startPoint.clone().add(new THREE.Vector3(0, 10, 0)), down);
        let intersect = raycaster.intersectObject(targetMesh, true);
        normals.push(intersect.length > 0 && intersect[0].face ? intersect[0].face.normal.clone() : new THREE.Vector3(0, 1, 0));
        
        const totalDistance = startPoint.distanceTo(endPoint);
        const numSteps = Math.ceil(totalDistance / stepLength);
        
        if (numSteps <= 1) {
            path.push(endPoint.clone());
            raycaster.set(endPoint.clone().add(new THREE.Vector3(0, 10, 0)), down);
            intersect = raycaster.intersectObject(targetMesh, true);
            normals.push(intersect.length > 0 && intersect[0].face ? intersect[0].face.normal.clone() : new THREE.Vector3(0, 1, 0));
            return { path, normals };
        }
    
        const direction = endPoint.clone().sub(startPoint).normalize();
    
        for (let i = 1; i <= numSteps; i++) {
            const distanceAlong = Math.min(stepLength * i, totalDistance);
            const nextPointXZ = startPoint.clone().add(direction.clone().multiplyScalar(distanceAlong));
            nextPointXZ.y = 100; // High up for raycasting
    
            raycaster.set(nextPointXZ, down);
            intersect = raycaster.intersectObject(targetMesh, true);
    
            if (intersect.length > 0) {
                if (path[path.length - 1].distanceToSquared(intersect[0].point) > 0.001) {
                    path.push(intersect[0].point);
                    normals.push(intersect[0].face ? intersect[0].face.normal.clone() : new THREE.Vector3(0, 1, 0));
                }
            } else {
                break;
            }
        }
    
        if (path[path.length - 1].distanceToSquared(endPoint) > 0.001) {
            path.push(endPoint.clone());
            raycaster.set(endPoint.clone().add(new THREE.Vector3(0, 10, 0)), down);
            intersect = raycaster.intersectObject(targetMesh, true);
            normals.push(intersect.length > 0 && intersect[0].face ? intersect[0].face.normal.clone() : new THREE.Vector3(0, 1, 0));
        }
        
        return { path, normals };
    }


    private createPathRibbon(path3D: THREE.Vector3[], pathNormals: THREE.Vector3[], pathWidth: number, material: THREE.Material, yOffset: number = 0.01) {
        const vertices: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let pathLength = 0;

        for (let k = 0; k < path3D.length; k++) {
            const point = path3D[k];
            const surfaceNormal = pathNormals[k];
            let direction = new THREE.Vector3();

            if (k < path3D.length - 1) {
                direction.subVectors(path3D[k + 1], point);
            } else {
                direction.subVectors(point, path3D[k - 1]);
            }
            direction.normalize();

            const right = new THREE.Vector3().crossVectors(direction, surfaceNormal).normalize();
            const leftPoint = new THREE.Vector3().subVectors(point, right.clone().multiplyScalar(pathWidth / 2));
            const rightPoint = new THREE.Vector3().addVectors(point, right.clone().multiplyScalar(pathWidth / 2));

            vertices.push(leftPoint.x, leftPoint.y + yOffset, leftPoint.z);
            vertices.push(rightPoint.x, rightPoint.y + yOffset, rightPoint.z);
            
            normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
            normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
            
            if (k > 0) {
                pathLength += path3D[k].distanceTo(path3D[k - 1]);
            }
            uvs.push(0, pathLength / pathWidth); // U is 0 for left edge
            uvs.push(1, pathLength / pathWidth); // U is 1 for right edge
        }
        
        for (let k = 0; k < path3D.length - 1; k++) {
            const tl = k * 2;
            const tr = k * 2 + 1;
            const bl = k * 2 + 2;
            const br = k * 2 + 3;
            indices.push(tl, bl, tr);
            indices.push(tr, bl, br);
        }

        if (vertices.length > 0 && indices.length > 0) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setIndex(indices);
            
            const pathMesh = new THREE.Mesh(geometry, material);
            return pathMesh;
        }
        return null;
    }
    
    private delaunayTriangulation(points: Vertex2D[]): Triangle2D[] {
        const epsilon = 1e-6;
    
        // 1. Create a bounding box and a super-triangle
        let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            minZ = Math.min(minZ, p.z);
            maxX = Math.max(maxX, p.x);
            maxZ = Math.max(maxZ, p.z);
        });
    
        const dx = maxX - minX;
        const dz = maxZ - minZ;
        const deltaMax = Math.max(dx, dz);
        const midX = minX + dx * 0.5;
        const midZ = minZ + dz * 0.5;
    
        const p0 = { x: midX - 20 * deltaMax, z: midZ - deltaMax, originalIndex: -1 };
        const p1 = { x: midX, z: midZ + 20 * deltaMax, originalIndex: -1 };
        const p2 = { x: midX + 20 * deltaMax, z: midZ - deltaMax, originalIndex: -1 };
        
        let triangles: Triangle2D[] = [{ v0: p0, v1: p1, v2: p2 }];
    
        // 2. Add points one by one
        points.forEach(point => {
            const badTriangles: Triangle2D[] = [];
            const polygon: Edge2D[] = [];
    
            // Find bad triangles
            triangles.forEach(triangle => {
                if (!triangle.circumcircle) {
                    const ax = triangle.v0.x, az = triangle.v0.z;
                    const bx = triangle.v1.x, bz = triangle.v1.z;
                    const cx = triangle.v2.x, cz = triangle.v2.z;
                    const D = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
                    const ux = ((ax * ax + az * az) * (bz - cz) + (bx * bx + bz * bz) * (cz - az) + (cx * cx + cz * cz) * (az - bz)) / D;
                    const uz = ((ax * ax + az * az) * (cx - bx) + (bx * bx + bz * bz) * (ax - cx) + (cx * cx + cz * cz) * (bx - ax)) / D;
                    const radiusSq = (ax - ux) ** 2 + (az - uz) ** 2;
                    triangle.circumcircle = { x: ux, z: uz, radiusSq };
                }
    
                const distSq = (point.x - triangle.circumcircle.x) ** 2 + (point.z - triangle.circumcircle.z) ** 2;
                if (distSq < triangle.circumcircle.radiusSq) {
                    badTriangles.push(triangle);
                }
            });
    
            // Find the boundary of the polygon hole
            badTriangles.forEach((triangle, i) => {
                const edges: Edge2D[] = [{ v0: triangle.v0, v1: triangle.v1 }, { v0: triangle.v1, v1: triangle.v2 }, { v0: triangle.v2, v1: triangle.v0 }];
                edges.forEach(edge => {
                    let isShared = false;
                    for (let j = 0; j < badTriangles.length; j++) {
                        if (i === j) continue;
                        const other = badTriangles[j];
                        const otherEdges: Edge2D[] = [{ v0: other.v0, v1: other.v1 }, { v0: other.v1, v1: other.v2 }, { v0: other.v2, v1: other.v0 }];
                        if (otherEdges.some(otherEdge =>
                            (edge.v0 === otherEdge.v0 && edge.v1 === otherEdge.v1) || (edge.v0 === otherEdge.v1 && edge.v1 === otherEdge.v0))) {
                            isShared = true;
                            break;
                        }
                    }
                    if (!isShared) {
                        polygon.push(edge);
                    }
                });
            });
    
            // Remove bad triangles and re-triangulate the hole
            triangles = triangles.filter(t => !badTriangles.includes(t));
            polygon.forEach(edge => {
                triangles.push({ v0: edge.v0, v1: edge.v1, v2: point });
            });
        });
    
        // 3. Remove triangles connected to the super-triangle
        return triangles.filter(t => !(t.v0.originalIndex === -1 || t.v1.originalIndex === -1 || t.v2.originalIndex === -1));
    }


    private generateGraphPaths(
        targetMesh: THREE.Mesh | null,
        innerContour: THREE.Vector3[]
    ) {
        if (!targetMesh || !this.pathToggleInput.checked || innerContour.length < 3) {
            return;
        }
    
        this.showLoading(true, "Generating paths...");
        this.pathGroup.clear();
    
        const numPoints = parseInt(this.pathPointsInput.value, 10);
        const loopPercentage = parseInt(this.pathLoopingInput.value, 10) / 100.0;
        const pathWidth = parseFloat(this.pathWidthInput.value);
    
        if (numPoints < 3) {
            this.showLoading(false);
            return;
        }
    
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        
        // 1. Scatter points (nodes) on the sand surface
        const nodes: THREE.Vector3[] = [];
        const pathAreaBox = new THREE.Box3().setFromPoints(innerContour);
        const maxAttempts = numPoints * 100; // To prevent infinite loops
        let attempts = 0;
        
        while (nodes.length < numPoints && attempts < maxAttempts) {
            const randomX = THREE.MathUtils.randFloat(pathAreaBox.min.x, pathAreaBox.max.x);
            const randomZ = THREE.MathUtils.randFloat(pathAreaBox.min.z, pathAreaBox.max.z);
            const testPoint2D = new THREE.Vector2(randomX, randomZ);
    
            if (this.isPointInPolygon(testPoint2D, innerContour)) {
                raycaster.set(new THREE.Vector3(randomX, pathAreaBox.max.y + 100, randomZ), down);
                const intersects = raycaster.intersectObject(targetMesh, true);
                if (intersects.length > 0) {
                    nodes.push(intersects[0].point);
                }
            }
            attempts++;
        }
    
        if (nodes.length < 3) {
            console.warn("Not enough nodes placed for path generation.");
            this.showLoading(false);
            return;
        }

        // 2. Perform Delaunay Triangulation
        const vertices2D: Vertex2D[] = nodes.map((n, i) => ({ x: n.x, z: n.z, originalIndex: i }));
        const triangles = this.delaunayTriangulation(vertices2D);
    
        // 3. Create a weighted edge list from triangles
        const allEdges: { u: number, v: number, weight: number }[] = [];
        const edgeSet = new Set<string>();
        triangles.forEach(tri => {
            const edges: [Vertex2D, Vertex2D][] = [[tri.v0, tri.v1], [tri.v1, tri.v2], [tri.v2, tri.v0]];
            edges.forEach(edge => {
                const u = edge[0].originalIndex;
                const v = edge[1].originalIndex;
                const key = `${Math.min(u,v)},${Math.max(u,v)}`;
                if (!edgeSet.has(key)) {
                    const p1 = nodes[u];
                    const p2 = nodes[v];
                    allEdges.push({ u, v, weight: p1.distanceToSquared(p2) });
                    edgeSet.add(key);
                }
            });
        });

        // 3.5. Penalize edges that cross rivers
        if (this.riverMeshes.length > 0) {
            const collisionRaycaster = new THREE.Raycaster();
            const yOffset = new THREE.Vector3(0, 0.1, 0); // Raycast slightly above surface
    
            allEdges.forEach(edge => {
                const startNode = nodes[edge.u];
                const endNode = nodes[edge.v];
    
                const distance = startNode.distanceTo(endNode);
                if (distance < 0.01) return;
    
                const direction = endNode.clone().sub(startNode).normalize();
                collisionRaycaster.set(startNode.clone().add(yOffset), direction);
    
                const intersects = collisionRaycaster.intersectObjects(this.riverMeshes, false);
    
                if (intersects.length > 0 && intersects[0].distance < distance) {
                    edge.weight = Infinity; // Mark this edge as "un-buildable"
                }
            });
        }

        allEdges.sort((a, b) => a.weight - b.weight);

        // 4. Compute Minimum Spanning Tree (MST) using Kruskal's algorithm
        const mstEdges: { u: number, v: number }[] = [];
        const remainingEdges: { u: number, v: number }[] = [];
        const uf = new UnionFind(nodes.length);
        
        allEdges.forEach(edge => {
            if (edge.weight === Infinity) {
                // Don't even consider adding this edge
                return;
            }
            if (uf.find(edge.u) !== uf.find(edge.v)) {
                uf.union(edge.u, edge.v);
                mstEdges.push({ u: edge.u, v: edge.v });
            } else {
                remainingEdges.push({ u: edge.u, v: edge.v });
            }
        });

        // 5. Add back some remaining edges to create loops
        remainingEdges.sort(() => Math.random() - 0.5); // Shuffle
        const numLoopsToAdd = Math.floor(remainingEdges.length * loopPercentage);
        const loops = remainingEdges.slice(0, numLoopsToAdd);

        const finalEdges = [...mstEdges, ...loops];

        // 6. Create path ribbons for each connection
        finalEdges.forEach(edge => {
            const startNode = nodes[edge.u];
            const endNode = nodes[edge.v];
    
            const { path, normals } = this.createSurfacePath(startNode, endNode, targetMesh, raycaster, down, pathWidth * 1.5);
    
            if (path.length >= 2) {
                const pathMesh = this.createPathRibbon(path, normals, pathWidth, this.pathMaterial);
                if (pathMesh) {
                    this.pathGroup.add(pathMesh);
                }
            }
        });
    }

    // =================================================================================
    // END PATH GENERATION
    // =================================================================================
    
    // =================================================================================
    // WATER FEATURES
    // =================================================================================

    private generateWaterFeatures(lakes: Lake[]) {
        if (!this.waterFeaturesToggle.checked || !this.islandSurface) return;

        this.showLoading(true, "Generating water features...");
        this.waterGroup.clear();
        this.riverMeshes = [];
        
        // 1. Add lake surfaces
        lakes.forEach(lake => {
            const lakeGeo = new THREE.CircleGeometry(lake.radius, 64);
            const lakeMesh = new THREE.Mesh(lakeGeo, this.waterMaterial);
            lakeMesh.position.set(lake.center.x, lake.waterLevel, lake.center.y);
            lakeMesh.rotation.x = -Math.PI / 2;
            this.waterGroup.add(lakeMesh);
        });

        // 2. Generate Rivers
        const numRivers = parseInt(this.numRiversInput.value, 10);
        if (numRivers > 0 && this.groundCoverMesh) {
            const riverWidth = parseFloat(this.riverWidthInput.value);
            const groundPositions = this.groundCoverMesh.geometry.attributes.position;
            const validStartPoints: THREE.Vector3[] = [];
            
            // Find valid starting points on the ground cover area
            for (let i = 0; i < groundPositions.count; i++) {
                 const point = new THREE.Vector3().fromBufferAttribute(groundPositions, i);
                 if (point.y > 1) { // Simple check to avoid shoreline
                    validStartPoints.push(point);
                 }
            }

            if (validStartPoints.length > 0) {
                 for (let i = 0; i < numRivers; i++) {
                    const startPoint = validStartPoints[Math.floor(Math.random() * validStartPoints.length)];
                    const riverPath = this.traceRiverPath(startPoint, this.islandSurface, lakes);
                    if (riverPath.length > 1) {
                         const { path, normals } = this.createSurfacePath(riverPath[0], riverPath[riverPath.length -1], this.islandSurface, new THREE.Raycaster(), new THREE.Vector3(0,-1,0), riverWidth);
                         
                        // Create riverbed (wider, darker)
                        const riverbedMesh = this.createPathRibbon(path, normals, riverWidth * 1.2, this.riverbedMaterial, 0.01);
                        if(riverbedMesh) {
                            this.waterGroup.add(riverbedMesh);
                            this.riverMeshes.push(riverbedMesh);
                        }
                        
                        // Create water
                        const waterMesh = this.createPathRibbon(path, normals, riverWidth, this.waterMaterial, 0.02);
                        if (waterMesh) {
                            this.waterGroup.add(waterMesh);
                            this.riverMeshes.push(waterMesh);
                        }
                    }
                 }
            }
        }
    }

    private traceRiverPath(
        startPoint: THREE.Vector3,
        targetMesh: THREE.Mesh,
        lakes: Lake[]
    ): THREE.Vector3[] {
        const path: THREE.Vector3[] = [startPoint.clone()];
        let currentPoint = startPoint.clone();
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        const stepLength = 1.0;
        const maxSteps = 200;
        let currentDirection = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();

        for (let i = 0; i < maxSteps; i++) {
            const samplePoints: {point: THREE.Vector3, elevation: number}[] = [];

            // Sample in a forward-facing arc
            for (let j = -3; j <= 3; j++) {
                const angle = (j / 3) * (Math.PI / 3); // 60 degree arc
                const rotatedDir = currentDirection.clone().applyAxisAngle(down, angle);
                const samplePos = currentPoint.clone().add(rotatedDir.multiplyScalar(stepLength));
                
                raycaster.set(samplePos.clone().setY(100), down);
                const intersects = raycaster.intersectObject(targetMesh, true);
                if (intersects.length > 0) {
                    samplePoints.push({ point: intersects[0].point, elevation: intersects[0].point.y });
                }
            }
            
            if (samplePoints.length === 0) break; // No valid forward path

            // Find the point with the lowest elevation (steepest descent)
            samplePoints.sort((a, b) => a.elevation - b.elevation);
            const nextPoint = samplePoints[0].point;

            if (nextPoint.y >= currentPoint.y) break; // Stuck in a local minimum

            currentDirection = nextPoint.clone().sub(currentPoint).normalize();
            currentPoint = nextPoint;
            path.push(currentPoint);

            // Check for termination conditions
            const currentPoint2D = new THREE.Vector2(currentPoint.x, currentPoint.z);
            if (lakes.some(lake => currentPoint.y < lake.waterLevel && currentPoint2D.distanceTo(lake.center) < lake.radius)) break; // Flowed into a lake

        }

        return path;
    }


    // =================================================================================
    // END WATER FEATURES
    // =================================================================================


  private generateFoliage(
    outerBoundary: THREE.Vector3[],
    innerBoundary: THREE.Vector3[],
    targetMesh: THREE.Mesh | null
  ) {
    this.showLoading(true, "Placing foliage...");
    
    setTimeout(() => {
        if (!targetMesh || this.foliageModels.length === 0) {
            if (this.foliageCoordinatesList) {
                this.foliageCoordinatesList.textContent = 'No foliage models loaded or no surface to place them on.';
            }
            this.showLoading(false);
            return;
        }

        try {
            this.foliageGroup.clear();
            
            this.placeFoliageOnMesh({
                targetMesh: targetMesh,
                models: this.foliageModels,
                densityInput: this.foliageDensityInput,
                maxCountInput: this.maxFoliageCountInput,
                maxSlopeInput: this.maxFoliageSlopeInput,
                scaleInput: this.foliageScaleInput,
                outerBoundary: outerBoundary,
                innerBoundary: innerBoundary,
                foliageBandWidth: parseFloat(this.foliageBandWidthInput.value),
                debugLabel: 'Foliage',
                outputElement: this.foliageCoordinatesList,
            });
        } catch (e) {
            console.error("Failed to place foliage:", e);
            alert("An error occurred during foliage placement. Please check console.");
            if (this.foliageCoordinatesList) this.foliageCoordinatesList.textContent = 'Error generating foliage.';
        } finally {
            this.showLoading(false);
        }
    }, 20);
  }

  private placeFoliageOnMesh(options: PlaceFoliageOptions) {
    const { targetMesh, models, densityInput, maxCountInput, maxSlopeInput, scaleInput, outerBoundary, innerBoundary, foliageBandWidth, debugLabel, outputElement } = options;

    const geometry = targetMesh.geometry;
    const positions = geometry.attributes.position;
    if (!geometry.index) {
        console.error(`${debugLabel}: Target mesh is non-indexed. Skipping foliage placement.`);
        if (outputElement) outputElement.textContent = `Error: ${debugLabel} mesh has no index. Cannot place foliage.`;
        return;
    }
    const indices = geometry.index.array;
    
    const maxSlopeDegrees = parseFloat(maxSlopeInput.value);
    const slopeThreshold = Math.cos(THREE.MathUtils.degToRad(maxSlopeDegrees));

    const debugStats = {
        totalFaces: indices.length / 3,
        rejectedSlope: 0,
        rejectedSubmerged: 0,
        rejectedOutsideBand: 0,
        rejectedInsideBand: 0,
        accepted: 0
    };
    
    const validFaces: {
        vA: THREE.Vector3,
        vB: THREE.Vector3,
        vC: THREE.Vector3,
        normal: THREE.Vector3,
        area: number
    }[] = [];
    let totalArea = 0;

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const triangle = new THREE.Triangle();
    const centroid = new THREE.Vector3();
    const centroid2D = new THREE.Vector2();
    const faceNormal = new THREE.Vector3();

    for (let i = 0; i < indices.length; i += 3) {
        const iA = indices[i];
        const iB = indices[i+1];
        const iC = indices[i+2];

        vA.fromBufferAttribute(positions, iA);
        vB.fromBufferAttribute(positions, iB);
        vC.fromBufferAttribute(positions, iC);
        
        THREE.Triangle.getNormal(vA, vB, vC, faceNormal);
        if (faceNormal.y < slopeThreshold) {
            debugStats.rejectedSlope++;
            continue;
        }
        if (vA.y <= 0 && vB.y <= 0 && vC.y <= 0) {
            debugStats.rejectedSubmerged++;
            continue;
        }

        centroid.copy(vA).add(vB).add(vC).divideScalar(3);
        centroid2D.set(centroid.x, centroid.z);
        
        if (!this.isPointInPolygon(centroid2D, outerBoundary)) {
            debugStats.rejectedOutsideBand++;
            continue;
        }

        if (this.isPointInPolygon(centroid2D, innerBoundary)) {
            debugStats.rejectedInsideBand++;
            continue;
        }
        
        debugStats.accepted++;
        const area = triangle.set(vA, vB, vC).getArea();
        validFaces.push({
            vA: vA.clone(), vB: vB.clone(), vC: vC.clone(),
            normal: faceNormal.clone(), area
        });
        totalArea += area;
    }

    const grassDensity = parseFloat(densityInput.value);
    let numInstances = Math.floor(totalArea / 100 * grassDensity);
    
    const maxFoliageCountVal = maxCountInput.value;
    if (maxFoliageCountVal) {
        const maxCount = parseInt(maxFoliageCountVal, 10);
        if (!isNaN(maxCount) && maxCount >= 0) {
            numInstances = Math.min(numInstances, maxCount);
        }
    }

    if (numInstances === 0 || validFaces.length === 0) {
        if(outputElement) {
            const message = `No ${debugLabel.toLowerCase()} generated.
Reason: No valid surface area found for placement.

Current Settings:
- Max Slope Allowed:      ${maxSlopeDegrees.toFixed(1).padStart(7)}°
- Foliage Band Width:     ${foliageBandWidth.toFixed(1).padStart(7)} units
Debug Stats:
- Total source faces:         ${String(debugStats.totalFaces).padStart(7)}
- Rejected (too steep):       ${String(debugStats.rejectedSlope).padStart(7)} (Faces > ${maxSlopeDegrees}° slope)
- Rejected (underwater):      ${String(debugStats.rejectedSubmerged).padStart(7)}
- Rejected (outside band):    ${String(debugStats.rejectedOutsideBand).padStart(7)}
- Rejected (inside band):     ${String(debugStats.rejectedInsideBand).padStart(7)}
- Accepted faces:             ${String(debugStats.accepted).padStart(7)}
- Calculated valid area:      ${totalArea.toFixed(2).padStart(7)} units²

Suggestion: Try increasing "Max Foliage Slope", or adjusting "Foliage Band Width".`;
            outputElement.textContent = message;
        }
        return;
    }

    const cdf: { faceIndex: number, cumulativeArea: number }[] = [];
    let cumulativeArea = 0;
    for(let i = 0; i < validFaces.length; i++) {
        cumulativeArea += validFaces[i].area;
        cdf.push({faceIndex: i, cumulativeArea});
    }

    // --- Instancing Setup ---
    this.foliageGroup.clear();
    const transformsByModel = new Map<FoliageData, THREE.Matrix4[]>();
    models.forEach(model => transformsByModel.set(model, []));

    const up = new THREE.Vector3(0, 1, 0);
    const FOLIAGE_Y_OFFSET = 0.02;
    const foliagePivotPoints: THREE.Vector3[] = [];
    const baseFoliageScale = parseFloat(scaleInput.value);
    
    // Reusable objects for performance
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const yRotationQuat = new THREE.Quaternion();

    // --- Generate all transformation matrices ---
    for (let i = 0; i < numInstances; i++) {
        const randomArea = Math.random() * totalArea;
        const foundCdf = cdf.find(item => item.cumulativeArea >= randomArea);
        if (!foundCdf) continue;

        const faceData = validFaces[foundCdf.faceIndex];
        
        let u = Math.random();
        let v = Math.random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;

        const point = new THREE.Vector3()
            .addScaledVector(faceData.vA, u)
            .addScaledVector(faceData.vB, v)
            .addScaledVector(faceData.vC, w);
        
        foliagePivotPoints.push(point.clone());

        if (models.length > 0) {
            const sourceFoliage = models[Math.floor(Math.random() * models.length)];
            
            position.copy(point).y += FOLIAGE_Y_OFFSET;

            const alignmentQuat = new THREE.Quaternion().setFromUnitVectors(up, faceData.normal);
            yRotationQuat.setFromAxisAngle(up, Math.random() * Math.PI * 2);
            quaternion.copy(alignmentQuat).multiply(yRotationQuat);
            
            const randomVariation = THREE.MathUtils.randFloat(0.8, 1.2);
            const finalScale = baseFoliageScale * randomVariation;
            scale.set(finalScale, finalScale, finalScale);

            matrix.compose(position, quaternion, scale);
            transformsByModel.get(sourceFoliage)?.push(matrix.clone());
        }
    }

    // --- Create one InstancedMesh per foliage model ---
    transformsByModel.forEach((matrices, sourceFoliage) => {
        if (matrices.length === 0) return;

        let sourceGeometry: THREE.BufferGeometry | null = null;

        sourceFoliage.model.traverse((child) => {
            if (child instanceof THREE.Mesh && !sourceGeometry) {
                sourceGeometry = child.geometry;
            }
        });

        if (sourceGeometry) {
            const instancedMesh = new THREE.InstancedMesh(sourceGeometry, this.foliageMaterial, matrices.length);
            for (let i = 0; i < matrices.length; i++) {
                instancedMesh.setMatrixAt(i, matrices[i]);
            }
            instancedMesh.instanceMatrix.needsUpdate = true;
            instancedMesh.castShadow = true;
            this.foliageGroup.add(instancedMesh);
        } else {
            console.warn(`Foliage model "${sourceFoliage.name}" contains no mesh geometry and was skipped.`);
        }
    });
    
    // --- Update UI ---
    if (foliagePivotPoints.length > 0) {
        if (outputElement) {
            const coordinatesText = foliagePivotPoints.map((p, index) => {
                const x = p.x.toFixed(2);
                const y = p.y.toFixed(2);
                const z = p.z.toFixed(2);
                return `${(index + 1).toString().padStart(4, ' ')}: (${x.padStart(7, ' ')}, ${y.padStart(7, ' ')}, ${z.padStart(7, ' ')})`;
            }).join('\n');
            outputElement.textContent = `Generated ${foliagePivotPoints.length} instances.\n${coordinatesText}`;
        }
    } else {
        if (outputElement) {
            outputElement.textContent = 'No foliage points generated.';
        }
    }
  }

  private showLoading(isLoading: boolean, message: string = "Loading...") {
    this.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    if(isLoading) {
      const loadingText = this.loadingOverlay.querySelector('p');
      if (loadingText) {
        loadingText.textContent = message;
      }
    }
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

new IslandGeneratorApp();