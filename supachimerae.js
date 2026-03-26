// Configuration Supabase
const supabaseUrl = 'https://nvjeeljvfmauzspinjlc.supabase.co';
const supabaseKey = 'sb_publishable_ZWltYHj5UfDn1b3aKr9rRA_01mnXUJw';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// Fonction pour SAUVEGARDER
async function db_save(nomUtilisateur, treeData) {
    const { error } = await client
        .from('arbres')
        .upsert({ 
            utilisateur_id: nomUtilisateur, 
            contenu_json: treeData 
        }, { onConflict: 'utilisateur_id' });

    if (error) {
        console.error("Erreur Supabase:", error);
        alert("Erreur lors de la sauvegarde.");
    } else {
        alert("Sauvegardé sur le Cloud !");
    }
}

// Fonction pour CHARGER
async function db_load(nomUtilisateur) {
    const { data, error } = await client
        .from('arbres')
        .select('contenu_json')
        .eq('utilisateur_id', nomUtilisateur)
        .maybeSingle(); // Évite l'erreur si l'utilisateur n'existe pas encore

    if (error) {
        console.error("Erreur chargement:", error);
        return null;
    }
    return data ? data.contenu_json : null;
}