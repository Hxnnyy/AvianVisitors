UPDATE captures SET identification=json_set(identification,'$.warnings',json('[]')) WHERE identification IS NOT NULL AND json_type(identification,'$.warnings') IS NULL;
