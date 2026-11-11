Lokale webOS-tv-controller 2.0.0

Local webOS TV Controller biedt lokale bediening van LG webOS-tv’s, bron- en kanaalrapportage en Flow-kaarten voor tv-opdrachten. De trigger voor bronrapportage geeft de bron-ID en het tijdstip door, ook bij een nieuw rapport over dezelfde bron. Met Vraag de huidige tv-bron op kun je de actuele bron bij een verbonden tv opvragen.

Gebruik de aparte kaarten voor afspelen, pauzeren, vooruitspoelen en terugspoelen. Bestaande Flows kunnen de verouderde kaart Afspelen/pauzeren wisselen blijven gebruiken. Die kaart volgt de laatst door LG bevestigde afspeel- of pauzeopdracht van Homey. Zonder betrouwbare opdrachtgeschiedenis kiest de kaart Afspelen. De tv-afstandsbediening kan de afspeelstatus afzonderlijk veranderen.

App of ingang gebruikt speaker_artist en Zender gebruikt speaker_track. Sommige automatische Homey-kaarten gebruiken de namen Artist of Track. Op apparaten die webos_display.app en webos_display.channel al hebben, volgen die tags de nieuwe velden. Zender blijft leeg buiten Live TV of als de tuner geen actueel kanaal meldt. Gebruik de huidige velden in nieuwe Flows.

Vereist Homey 12.9.0 of hoger. Getest op een LG G4 met webOS 25. Sommige tv’s met webOS 26 weigeren het ondertekende koppelingscertificaat en kunnen met deze versie problemen hebben met koppelen of opnieuw verbinden. Laat bij een update de app en het tv-apparaat geïnstalleerd zodat Homey de koppeling, instellingen en opgeslagen Flow-koppelingen kan behouden. Verwijder de experimentele kaart Leg onbewerkte LG-appdiagnostiek vast uit Flows die deze kaart uit versie 1.0.51 Test gebruiken.

volume_set gebruikt waarden van 0 tot 1; aangepaste volumevoorwaarden gebruiken 0 tot 100. Gebruik voor het instellen van het Sonos-volume het Sonos-apparaat en behoud de ingestelde limieten. Beschouw een LG-volumewaarde niet als een Sonos-volumewaarde. Expliciet dempen en dempen opheffen blijven beschikbaar.

De app verbetert volumeverwerking, bron- en kanaalrapportage, foutmeldingen, afstandsbedieningsknoppen en het sluiten van meldingen. Bij de LG-melding 500 Application error tijdens kanaalrapportage op de achtergrond blijft Zender leeg. Een fout bij een expliciete opdracht wordt aan de Flow doorgegeven.

Gebaseerd op WebOS Plus van Max van de Laar: https://github.com/MaxvandeLaar/homey-webos-plus
Oorspronkelijke auteursvermeldingen en GPL-3.0-or-later-licentie zijn behouden. Het oorspronkelijke project ondersteunt deze afgeleide versie niet namens ons; gebruik het supportadres van deze app.
