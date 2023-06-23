run: ## run_owner
	@for i in {1..100}; do \
		echo "Iteration $$i"; \
		yarn run dev; \
		sleep 60; \
	done

run_owner: ## Generate cookie for owner only
	@echo "-- runn owner"
	yarn run owner

run_scrap: ## Scrap collections volume data
	@echo "-- run volume scrapper"
	yarn run volume

run_ankr: ## Scrap collections ankr data
	@for i in {1..100}; do \
		echo "Iteration $$i"; \
		yarn run ankr; \
		sleep 60; \
	done