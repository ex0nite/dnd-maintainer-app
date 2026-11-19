# Attribution

The JSON files of this folder (the 2014 SRD layer of the rules) and the snapshot they are generated from
(`scripts/srd-2014/snapshot/`) contain material of the System Reference Document 5.1:

> This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and
> available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative
> Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

Changes made to that material: the SRD records of the open `5e-database` data set (project `5e-bits/5e-database`, folder
`src/2014/en`, commit pinned in `scripts/srd-2014/upstream.ts`) are converted by `scripts/generate-srd-2014.ts` into the
rule entries of this application (grants, choices, feature text; for the classes, the level tables of the SRD become
levels of grants, and the starting equipment of a class is written as one sentence from its SRD lists). Names keep the SRD English text and gain a French name;
descriptions keep the SRD English text; a few descriptions of dragon ancestries are rebuilt from the SRD table.

Nothing outside the SRD 5.1 may be added here: this repository is public.
