// Pas de console sur Windows en version finale.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pictone_lib::run()
}
