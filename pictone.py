import tkinter as tk
from tkinter import filedialog, ttk, messagebox
from PIL import Image, ImageTk, ImageFilter
import cv2
import numpy as np
import os
import requests
import webbrowser

CURRENT_VERSION = "1.0.0"

# Fonction pour vérifier les mises à jour
def check_for_updates():
    try:
        version_url = "https://raw.githubusercontent.com/Kyosuke01/PicTone/main/version.txt"
        response = requests.get(version_url)
        latest_version = response.text.strip()

        if latest_version != CURRENT_VERSION:
            if messagebox.askyesno("⬆️ PicTone - Mise à jour disponible", f"Une nouvelle version de PicTone est disponible.\nVersion : {latest_version}\nVoulez-vous la télécharger ?"):
                webbrowser.open("https://github.com/Kyosuke01/PicTone/releases/latest")
    except requests.RequestException as e:
        messagebox.showerror("Erreur", f"Problème de connexion pour vérifier les mises à jour : {e}")
    except Exception as e:
        messagebox.showerror("Erreur", f"Impossible de vérifier les mises à jour : {e}")

MAX_DISPLAY_SIZE = 350  # Taille maximale pour l'affichage des images

def resize_preserve_aspect(image, max_size=MAX_DISPLAY_SIZE):
    """Redimensionne l'image en respectant son ratio, sans dépasser max_size en largeur ou hauteur."""
    img_copy = image.copy()
    img_copy.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    return img_copy

class ImageFilterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Application de Filtres d'Images")
        self.root.geometry("900x500")
        
        # Centrer la fenêtre sur l'écran
        window_width, window_height = 900, 500
        screen_width, screen_height = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
        x_position, y_position = (screen_width - window_width) // 2, (screen_height - window_height) // 2
        self.root.geometry(f"{window_width}x{window_height}+{x_position}+{y_position}")

        # Ajout de l'icône de l'application
        try:
            root.iconbitmap(os.path.join(os.path.dirname(__file__), "pictone.ico"))
        except Exception as e:
            print(f"Erreur d'icône : {e}")  # Permet d'ignorer l'erreur si l'icône n'est pas trouvée

        # Vérification des mises à jour au lancement
        check_for_updates()

        # Cadre des contrôles
        self.controls_frame = tk.Frame(root, width=200, bg="#ddd", padx=20, pady=20)
        self.controls_frame.pack(side=tk.LEFT, fill=tk.Y, padx=10, pady=10)

        # Cadre interne pour aligner les boutons
        self.inner_controls_frame = tk.Frame(self.controls_frame, bg="#ddd")
        self.inner_controls_frame.pack(expand=True)

        # Cadre principal des images
        self.image_frame = tk.Frame(root)
        self.image_frame.pack(side=tk.RIGHT, expand=True, fill=tk.BOTH)

        # Barre de séparation
        self.separator = tk.Frame(root, width=2, bg="black")
        self.separator.pack(side=tk.LEFT, fill=tk.Y, padx=5)

        # Bouton pour charger une image
        self.load_button = tk.Button(self.inner_controls_frame, text="Charger une image", 
                                     command=self.load_image, bg="#4CAF50", fg="white", padx=10, pady=5)
        self.load_button.pack(pady=10)

        # Menu déroulant pour les filtres
        self.filter_label = tk.Label(self.inner_controls_frame, text="Choisir un filtre :", bg="#ddd")
        self.filter_label.pack(pady=5)

        self.filter_options = [
            "Aucun", "Noir & Blanc", "Sépia", "Flou", "Contours", 
            "Opacité", "Vert", "Rouge", "Bleu", "Nuance de Gris", 
            "Négatif"
        ]
        self.filter_var = tk.StringVar(value="Aucun")

        self.filter_menu = ttk.Combobox(
            self.inner_controls_frame, values=self.filter_options, 
            textvariable=self.filter_var, state="readonly")
        self.filter_menu.pack(pady=5)
        self.filter_menu.bind("<<ComboboxSelected>>", self.apply_filter)

        # Slider pour régler l’intensité du flou (invisible par défaut)
        self.blur_slider = tk.Scale(
            self.inner_controls_frame, from_=1, to=255, resolution=0.5,  # Valeurs flottantes pour plus de précision
            orient="horizontal", label="Intensité du Flou", bg="#ddd"
        )

        # Slider pour régler l’opacité (invisible par défaut)
        self.opacity_slider = tk.Scale(
            self.inner_controls_frame, from_=0, to=255, orient="horizontal", label="Opacité", bg="#ddd"
        )
        self.opacity_slider.set(255)  # Définit la valeur par défaut à 255 (opacité maximale)
        
        # Bouton pour enregistrer l'image
        self.save_button = tk.Button(
            self.inner_controls_frame, text="Sauvegarder l'image", 
            command=self.save_image, state=tk.DISABLED, bg="#008CBA", fg="white", padx=10, pady=5)
        self.save_button.pack(pady=10)

        # Labels pour afficher les images (Avant / Après)
        self.original_label = tk.Label(self.image_frame, text="Image Originale", width=40, height=20, bg="#bbb")
        self.original_label.pack(side=tk.LEFT, expand=True, fill=tk.BOTH, padx=5, pady=5)

        self.filtered_label = tk.Label(self.image_frame, text="Image Modifiée", width=40, height=20, bg="#bbb")
        self.filtered_label.pack(side=tk.RIGHT, expand=True, fill=tk.BOTH, padx=5, pady=5)

        # Stockage des images
        self.original_image = None            # Image redimensionnée pour l'affichage
        self.original_image_full = None       # Image en taille réelle
        self.filtered_image = None
        self.image_name = "image"             # Nom de base de l'image

    def load_image(self):
        file_path = filedialog.askopenfilename(filetypes=[("Images", "*.png;*.jpg;*.jpeg;*.bmp")])
        if file_path:
            self.image_name = os.path.splitext(os.path.basename(file_path))[0]  # Nom sans extension
            self.original_image_full = Image.open(file_path)  # Image en taille réelle

            # Redimensionner pour l'affichage en respectant le ratio
            self.original_image = resize_preserve_aspect(self.original_image_full)
            self.filtered_image = self.original_image.copy()  # Copie initiale pour affichage

            self.display_images()
            self.save_button.config(state=tk.NORMAL)
            # Réinitialiser le filtre à "Aucun" et masquer les sliders
            self.filter_var.set("Aucun")
            self.blur_slider.pack_forget()
            self.opacity_slider.pack_forget()

    def display_images(self):
        # Afficher l'image originale
        original_tk = ImageTk.PhotoImage(self.original_image)
        self.original_label.config(image=original_tk, text="")
        self.original_label.image = original_tk

        # Afficher l'image filtrée
        filtered_tk = ImageTk.PhotoImage(self.filtered_image)
        self.filtered_label.config(image=filtered_tk, text="")
        self.filtered_label.image = filtered_tk
    
    def delayed_blur(self, value):
        if hasattr(self, "blur_after_id"):
            self.root.after_cancel(self.blur_after_id)  # Annule les appels précédents si l'utilisateur bouge encore le slider
        self.blur_after_id = self.root.after(100, self.apply_blur_filter)  # Applique après 100ms

    def apply_blur_filter(self):
        if self.original_image_full is None:
            return

        blur_intensity = float(self.blur_slider.get())  # Récupère la valeur du slider avec précision
        filtered = self.original_image_full.copy().filter(ImageFilter.GaussianBlur(blur_intensity))

        self.filtered_image = resize_preserve_aspect(filtered)
        self.display_images()

    def apply_filter(self, event=None):
        if self.original_image_full is None:
            return

        selected_filter = self.filter_var.get()
        # Repartir de l'image originale en pleine résolution
        filtered = self.original_image_full.copy()

        # Gérer l'affichage des sliders
        if selected_filter == "Flou":
            self.blur_slider.pack(pady=5)
            self.blur_slider.config(command=self.delayed_blur)  # Délai avant d'appliquer le filtre
        else:
            self.blur_slider.pack_forget()

        if selected_filter == "Opacité":
            self.opacity_slider.pack(pady=5)
        else:
            self.opacity_slider.pack_forget()

        if selected_filter == "Noir & Blanc":
            # Convertir l'image en niveaux de gris avec une approche claire : 255 pour blanc, 0 pour noir
            img_array = np.array(filtered.convert("RGB"))
            
            # Calculer la luminosité
            luminance = np.dot(img_array[...,:3], [0.2989, 0.5870, 0.1140])
            
            # Appliquer un seuil pour transformer en noir ou blanc
            threshold = 128  # Valeur qui détermine la séparation entre noir et blanc
            binarized = (luminance > threshold) * 255  # Si au-dessus du seuil, blanc (255), sinon noir (0)
            
            # Recréer l'image avec seulement du noir et blanc
            filtered = Image.fromarray(np.stack([binarized, binarized, binarized], axis=-1).astype(np.uint8))

        elif selected_filter == "Sépia":
            img_array = np.array(filtered.convert("RGB"))
            sepia_filter = np.array([[0.393, 0.769, 0.189],
                                     [0.349, 0.686, 0.168],
                                     [0.272, 0.534, 0.131]]).astype(np.float32)
            sepia_img = np.dot(img_array, sepia_filter.T)
            sepia_img = np.clip(sepia_img, 0, 255).astype(np.uint8)
            filtered = Image.fromarray(sepia_img)

        elif selected_filter == "Flou":
            blur_intensity = self.blur_slider.get()
            filtered = filtered.filter(ImageFilter.GaussianBlur(blur_intensity))

        elif selected_filter == "Contours":
            img_cv = cv2.cvtColor(np.array(filtered), cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(img_cv, 100, 200)
            filtered = Image.fromarray(edges)

        # Appliquer les autres filtres
        elif selected_filter == "Opacité":
            self.opacity_slider.pack(pady=5)
            self.opacity_slider.config(command=self.delayed_opacity)

        elif selected_filter == "Vert":
            filtered = self.apply_vert(filtered)

        elif selected_filter == "Rouge":
            filtered = self.apply_rouge(filtered)

        elif selected_filter == "Bleu":
            filtered = self.apply_bleu(filtered)

        elif selected_filter == "Nuance de Gris":
            filtered = self.apply_nuance_de_gris(filtered)

        elif selected_filter == "Négatif":
            filtered = self.apply_negatif(filtered)

        # Pour l'affichage, redimensionner en respectant le ratio
        self.filtered_image = resize_preserve_aspect(filtered)
        self.display_images()

    def delayed_opacity(self, value):
        if hasattr(self, "opacity_after_id"):
            self.root.after_cancel(self.opacity_after_id)  # Annule les appels précédents si l'utilisateur bouge encore le slider
        self.opacity_after_id = self.root.after(100, self.apply_opacity_filter)  # Applique après 100ms

    def apply_opacity_filter(self):
        if self.original_image_full is None:
            return

        opacity_value = float(self.opacity_slider.get()) / 255  # Convertir l'opacité de 0 à 1
        filtered = self.apply_opacity(self.original_image_full, opacity_value)

        self.filtered_image = resize_preserve_aspect(filtered)
        self.display_images()

    def apply_opacity(self, img, opacity):
        if img is None:
            return img

        img = img.convert("RGBA")
        img_array = np.array(img)
        img_array[..., 3] = (img_array[..., 3] * opacity).astype(np.uint8)  # Modifier le canal alpha

        return Image.fromarray(img_array)

    def apply_vert(self, img):
        img = img.convert("RGB")
        
        # Création des Look-Up Tables (LUT) pour chaque canal
        red_lut = [max(0, i - 75) for i in range(256)]    # Réduction du rouge
        green_lut = [min(255, i + 75) for i in range(256)] # Augmentation du vert
        blue_lut = [max(0, i - 75) for i in range(256)]    # Réduction du bleu
        
        # Séparation des canaux et application des LUT
        r, g, b = img.split()
        r = r.point(red_lut)
        g = g.point(green_lut)
        b = b.point(blue_lut)
        
        # Fusion des canaux modifiés
        return Image.merge("RGB", (r, g, b))

    def apply_rouge(self, img):
        img = img.convert("RGB")
        
        # Création des Look-Up Tables (LUT) pour chaque canal
        red_lut = [max(0, i + 75) for i in range(256)]    # Réduction du rouge
        green_lut = [min(255, i - 75) for i in range(256)] # Augmentation du vert
        blue_lut = [max(0, i - 75) for i in range(256)]    # Réduction du bleu
        
        # Séparation des canaux et application des LUT
        r, g, b = img.split()
        r = r.point(red_lut)
        g = g.point(green_lut)
        b = b.point(blue_lut)
        
        # Fusion des canaux modifiés
        return Image.merge("RGB", (r, g, b))

    def apply_bleu(self, img):
        img = img.convert("RGB")
        
        # Création des Look-Up Tables (LUT) pour chaque canal
        red_lut = [max(0, i - 75) for i in range(256)]    # Réduction du rouge
        green_lut = [min(255, i - 75) for i in range(256)] # Augmentation du vert
        blue_lut = [max(0, i + 75) for i in range(256)]    # Réduction du bleu
        
        # Séparation des canaux et application des LUT
        r, g, b = img.split()
        r = r.point(red_lut)
        g = g.point(green_lut)
        b = b.point(blue_lut)
        
        # Fusion des canaux modifiés
        return Image.merge("RGB", (r, g, b))

    def apply_nuance_de_gris(self, img):
        img = img.convert("RGB")
        data = np.array(img)
        gray = np.mean(data, axis=-1).astype(np.uint8)
        return Image.fromarray(np.stack([gray, gray, gray], axis=-1))

    def apply_negatif(self, img):
        img = img.convert("RGB")
        data = np.array(img)
        return Image.fromarray(255 - data)

    def save_image(self):
        if self.original_image_full is None:
            return

        selected_filter = self.filter_var.get()
        # Création du nom de fichier prérempli
        filter_suffix = selected_filter.lower().replace(" ", "_") if selected_filter != "Aucun" else ""
        default_name = f"{self.image_name}-{filter_suffix}.png" if filter_suffix else f"{self.image_name}.png"

        file_path = filedialog.asksaveasfilename(
            defaultextension=".png",
            initialfile=default_name,
            filetypes=[("PNG files", "*.png"), ("JPEG files", "*.jpg"), ("All Files", "*.*")]
        )
        
        if file_path:
            # Appliquer le filtre sur l'image en taille réelle
            filtered = self.original_image_full.copy()

            if selected_filter == "Noir & Blanc":
                # Convertir l'image en niveaux de gris avec une approche claire : 255 pour blanc, 0 pour noir
                img_array = np.array(filtered.convert("RGB"))
                
                # Calculer la luminosité
                luminance = np.dot(img_array[...,:3], [0.2989, 0.5870, 0.1140])
                
                # Appliquer un seuil pour transformer en noir ou blanc
                threshold = 128  # Valeur qui détermine la séparation entre noir et blanc
                binarized = (luminance > threshold) * 255  # Si au-dessus du seuil, blanc (255), sinon noir (0)
                
                # Recréer l'image avec seulement du noir et blanc
                filtered = Image.fromarray(np.stack([binarized, binarized, binarized], axis=-1).astype(np.uint8))
                
            elif selected_filter == "Sépia":
                img_array = np.array(filtered.convert("RGB"))
                sepia_filter = np.array([[0.393, 0.769, 0.189],
                                        [0.349, 0.686, 0.168],
                                        [0.272, 0.534, 0.131]]).astype(np.float32)
                sepia_img = np.dot(img_array, sepia_filter.T)
                sepia_img = np.clip(sepia_img, 0, 255).astype(np.uint8)
                filtered = Image.fromarray(sepia_img)

            elif selected_filter == "Flou":
                blur_intensity = self.blur_slider.get()
                filtered = filtered.filter(ImageFilter.GaussianBlur(blur_intensity))

            elif selected_filter == "Contours":
                img_cv = cv2.cvtColor(np.array(filtered), cv2.COLOR_RGB2GRAY)
                edges = cv2.Canny(img_cv, 100, 200)
                filtered = Image.fromarray(edges).convert("RGB")

            elif selected_filter == "Opacité":
                opacity_value = float(self.opacity_slider.get()) / 255
                filtered = self.apply_opacity(filtered, opacity_value)

            elif selected_filter == "Vert":
                filtered = self.apply_vert(filtered)

            elif selected_filter == "Rouge":
                filtered = self.apply_rouge(filtered)

            elif selected_filter == "Bleu":
                filtered = self.apply_bleu(filtered)

            elif selected_filter == "Nuance de Gris":
                filtered = self.apply_nuance_de_gris(filtered)

            elif selected_filter == "Négatif":
                filtered = self.apply_negatif(filtered)

            # Sauvegarder l'image avec le bon format
            if selected_filter == "Noir & Blanc":
                filtered.save(file_path, format="PNG")
            else:
                filtered.save(file_path)

if __name__ == "__main__":
    root = tk.Tk()
    app = ImageFilterApp(root)
    root.mainloop()
