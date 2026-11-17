Lokale webOS-tv-controller 2.0.5

Voorkomt dat de Flow-kaart voor bevestiging dat de tv aanstaat opnieuw afgaat wanneer een LG-tv op dezelfde verbinding uit de schermbeveiliging komt. Bij het ontwaken uit stand-by ontvangt de Flow nog steeds een bevestiging.

Ook opgenomen sinds 2.0.4

Verhelpt een probleem waarbij Homey een LG-tv na een herstart van de app als niet beschikbaar markeerde als de tv in stand-by stond. Daardoor bereikte de bestaande opdracht Inschakelen de tv niet. De app blijft de tv automatisch op het netwerk vinden en beheert de beschikbaarheid nu afzonderlijk.

Deze testversie bevat ook Sascha’s handmatige koppeling via IP, een instelling om opnieuw te koppelen, een optionele ongetekende koppeling voor tv’s die het ondertekende certificaat weigeren en optionele volumeregeling in stappen voor externe audio. Ondertekende koppeling blijft de standaard en volumeregeling in stappen staat standaard uit. Werk de bestaande installatie bij om de koppeling, instellingen en opgeslagen Flows te behouden.

Local webOS TV Controller biedt lokale bediening van LG webOS-tv’s, bron- en kanaalrapportage en Flow-kaarten voor tv-opdrachten. De trigger voor bronrapportage geeft de bron-ID en het tijdstip door, ook bij een nieuw rapport over dezelfde bron. Met Vraag de huidige tv-bron op kun je de actuele bron bij een verbonden tv opvragen.

Met Sascha’s ingangskeuze kun je een HDMI-bron kiezen op het tv-apparaat in Homey. De keuzelijst gebruikt de namen van de tv, valt terug op HDMI 1–4 als die namen ontbreken en volgt de ingang die de tv meldt.

De kaart De tv bevestigde dat hij aan staat geeft Flows het tijdstip waarop de tv via de powerlistener meldt dat hij actief is. Gebruik deze kaart om Flows voor het inschakelen van de tv en het wisselen van ingang op elkaar af te stemmen.

Gebruik de aparte kaarten voor afspelen, pauzeren, vooruitspoelen en terugspoelen. Bestaande Flows kunnen de verouderde kaart Afspelen/pauzeren wisselen blijven gebruiken. Die kaart volgt de laatst door LG bevestigde afspeel- of pauzeopdracht van Homey. Zonder betrouwbare opdrachtgeschiedenis kiest de kaart Afspelen. De tv-afstandsbediening kan de afspeelstatus afzonderlijk veranderen.

App of ingang gebruikt speaker_artist en Zender gebruikt speaker_track. Sommige automatische Homey-kaarten gebruiken de namen Artist of Track. Op apparaten die webos_display.app en webos_display.channel al hebben, volgen die tags de nieuwe velden. Zender blijft leeg buiten Live TV of als de tuner geen actueel kanaal meldt. Gebruik de huidige velden in nieuwe Flows.

Vereist Homey 12.9.0 of hoger. Getest op een LG G4 met webOS 25. Sommige tv’s met webOS 26 weigeren het ondertekende koppelingscertificaat en kunnen met deze versie problemen hebben met koppelen of opnieuw verbinden. Laat bij een update de app en het tv-apparaat geïnstalleerd zodat Homey de koppeling, instellingen en opgeslagen Flow-koppelingen kan behouden. Verwijder de experimentele kaart Leg onbewerkte LG-appdiagnostiek vast uit Flows die deze kaart uit versie 1.0.51 Test gebruiken.

volume_set gebruikt waarden van 0 tot 1; aangepaste volumevoorwaarden gebruiken 0 tot 100. Gebruik voor het instellen van het Sonos-volume het Sonos-apparaat en behoud de ingestelde limieten. Beschouw een LG-volumewaarde niet als een Sonos-volumewaarde. Expliciet dempen en dempen opheffen blijven beschikbaar.

De app verbetert volumeverwerking, bron- en kanaalrapportage, foutmeldingen, afstandsbedieningsknoppen en het sluiten van meldingen. Bij de LG-melding 500 Application error tijdens kanaalrapportage op de achtergrond blijft Zender leeg. Een fout bij een expliciete opdracht wordt aan de Flow doorgegeven.

Gebaseerd op WebOS Plus van Max van de Laar: https://github.com/MaxvandeLaar/homey-webos-plus
Oorspronkelijke auteursvermeldingen en GPL-3.0-or-later-licentie zijn behouden. Het oorspronkelijke project ondersteunt deze afgeleide versie niet namens ons; gebruik het supportadres van deze app.
